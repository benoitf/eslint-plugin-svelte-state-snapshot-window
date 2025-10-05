import type { TSESTree } from '@typescript-eslint/utils';
import type { Rule } from 'eslint';
import type * as ts from 'typescript';

/**
 * ESLint rule to enforce $state.snapshot when passing $state variables to window.* calls
 */

// Type definitions for TypeScript parser services
interface ParserServices {
  program?: ts.Program;
  esTreeNodeToTSNodeMap?: WeakMap<TSESTree.Node, ts.Node>;
}

interface TypeWithUnion extends ts.Type {
  types?: ts.Type[];
}

type ESTreeNode = TSESTree.Node & { parent?: TSESTree.Node };

interface VariableDef {
  node: TSESTree.VariableDeclarator & {
    init: TSESTree.CallExpression | null;
  };
}

interface Variable {
  name: string;
  defs: VariableDef[];
}

interface Scope {
  variables: Variable[];
  upper: Scope | null;
}

const snapshotRequired: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require $state.snapshot when passing Svelte $state variables to window.* calls (Electron IPC).',
    },
    messages: {
      requireSnapshot: "Wrap $state variable '{{name}}' with $state.snapshot(...) before passing to window method.",
    },
    schema: [],
    hasSuggestions: true,
    fixable: 'code',
  },

  create(context) {
    const sourceCode = context.sourceCode;

    // Try to get TypeScript services for type checking
    let checker: ts.TypeChecker | null = null;
    let hasTypeInfo = false;
    try {
      const parserServices =
        (context as { sourceCode?: { parserServices?: ParserServices }; parserServices?: ParserServices }).sourceCode
          ?.parserServices || (context as { parserServices?: ParserServices }).parserServices;
      if (parserServices?.program && parserServices?.esTreeNodeToTSNodeMap) {
        checker = parserServices.program.getTypeChecker();
        hasTypeInfo = true;
      }
    } catch {
      // TypeScript parser not available
    }

    // Helper to check if a TypeScript type is primitive
    const isTypeScriptPrimitive = (tsNode: ts.Node): boolean => {
      if (!checker || !tsNode) return false;

      try {
        const type = checker.getTypeAtLocation(tsNode);
        if (!type) return false;

        const typeFlags = type.flags;

        // TypeScript TypeFlags enum actual values:
        const TypeFlags = {
          String: 4, // 1 << 2
          Number: 8, // 1 << 3
          Boolean: 16, // 1 << 4
          Enum: 32, // 1 << 5
          BigInt: 64, // 1 << 6
          StringLiteral: 128, // 1 << 7
          NumberLiteral: 256, // 1 << 8
          BooleanLiteral: 512, // 1 << 9
          EnumLiteral: 1024, // 1 << 10
          ESSymbol: 2048, // 1 << 11
          UniqueESSymbol: 4096, // 1 << 12
          Void: 8192, // 1 << 13
          Undefined: 16384, // 1 << 14
          Null: 32768, // 1 << 15
          Never: 65536, // 1 << 16
          Union: 1048576, // 1 << 20
        };

        // If it's a union type, check if ALL constituents are primitives
        if (typeFlags & TypeFlags.Union) {
          const unionType = type as TypeWithUnion;
          if (unionType.types && Array.isArray(unionType.types)) {
            const allPrimitive = unionType.types.every((t: ts.Type) => {
              const f = t.flags;
              return !!(
                f & TypeFlags.String ||
                f & TypeFlags.Number ||
                f & TypeFlags.Boolean ||
                f & TypeFlags.Enum ||
                f & TypeFlags.BigInt ||
                f & TypeFlags.StringLiteral ||
                f & TypeFlags.NumberLiteral ||
                f & TypeFlags.BooleanLiteral ||
                f & TypeFlags.EnumLiteral ||
                f & TypeFlags.ESSymbol ||
                f & TypeFlags.UniqueESSymbol ||
                f & TypeFlags.Void ||
                f & TypeFlags.Undefined ||
                f & TypeFlags.Null ||
                f & TypeFlags.Never
              );
            });
            return allPrimitive;
          }
        }

        // Check if the type is a primitive type
        const isPrimitive = !!(
          typeFlags & TypeFlags.String ||
          typeFlags & TypeFlags.Number ||
          typeFlags & TypeFlags.Boolean ||
          typeFlags & TypeFlags.Enum ||
          typeFlags & TypeFlags.BigInt ||
          typeFlags & TypeFlags.StringLiteral ||
          typeFlags & TypeFlags.NumberLiteral ||
          typeFlags & TypeFlags.BooleanLiteral ||
          typeFlags & TypeFlags.EnumLiteral ||
          typeFlags & TypeFlags.ESSymbol ||
          typeFlags & TypeFlags.UniqueESSymbol ||
          typeFlags & TypeFlags.Void ||
          typeFlags & TypeFlags.Undefined ||
          typeFlags & TypeFlags.Null ||
          typeFlags & TypeFlags.Never
        );

        return isPrimitive;
      } catch {
        return false;
      }
    };

    // Helper to get TypeScript node from ESTree node
    const getTSNode = (esNode: TSESTree.Node): ts.Node | null => {
      try {
        const parserServices =
          (context as { sourceCode?: { parserServices?: ParserServices }; parserServices?: ParserServices }).sourceCode
            ?.parserServices || (context as { parserServices?: ParserServices }).parserServices;
        if (parserServices?.esTreeNodeToTSNodeMap) {
          return parserServices.esTreeNodeToTSNodeMap.get(esNode) ?? null;
        }
      } catch {
        // Ignore
      }
      return null;
    };

    // Helper function to get the root identifier from a member expression
    const getRootIdentifier = (argNode: TSESTree.Node): TSESTree.Identifier | null => {
      if (argNode.type === 'Identifier') {
        return argNode as TSESTree.Identifier;
      }
      if (argNode.type === 'MemberExpression') {
        return getRootIdentifier(argNode.object);
      }
      return null;
    };

    // Check if the $state initialization is definitely a primitive type (without needing TypeScript)
    const isDefinitelyPrimitive = (initNode: TSESTree.CallExpression): boolean => {
      if (!initNode) {
        return false;
      }

      // $state() with no arguments - cannot determine without TypeScript type info
      if (initNode.arguments.length === 0) {
        return false;
      }

      const arg = initNode.arguments[0];

      // Helper to check if a node is a primitive literal or undefined identifier
      const isPrimitiveLiteral = (node: TSESTree.Node): boolean => {
        // Check for literal primitives (string, number, boolean, null)
        if (
          node.type === 'Literal' &&
          (typeof node.value === 'string' ||
            typeof node.value === 'number' ||
            typeof node.value === 'boolean' ||
            node.value === null)
        ) {
          return true;
        }
        // Check for undefined identifier
        if (node.type === 'Identifier' && node.name === 'undefined') {
          return true;
        }
        return false;
      };

      // Check if it's a primitive literal or undefined
      if (isPrimitiveLiteral(arg)) {
        return true;
      }

      // Check if it's a ternary expression where both branches are primitives
      if (arg.type === 'ConditionalExpression') {
        const consequentPrimitive = isPrimitiveLiteral(arg.consequent);
        const alternatePrimitive = isPrimitiveLiteral(arg.alternate);

        if (consequentPrimitive && alternatePrimitive) {
          return true;
        }
      }

      return false;
    };

    // Recursively check an expression for $state variables
    const checkExpression = (expr: ESTreeNode, windowCallNode: TSESTree.Node): void => {
      // Check if this is a member expression (property access)
      const isMemberExpression = expr.type === 'MemberExpression';

      // Get the root identifier (handles both direct identifiers and member expressions)
      const rootIdentifier = getRootIdentifier(expr);

      if (rootIdentifier) {
        // Try to find the variable in the current scope or any parent scope
        let variable: Variable | undefined;
        let currentScope: Scope | null = sourceCode.getScope(windowCallNode as unknown as Rule.Node) as Scope | null;

        while (currentScope && !variable) {
          variable = currentScope.variables.find((v: Variable) => v.name === rootIdentifier.name);
          if (!variable) {
            currentScope = currentScope.upper;
          }
        }

        if (!variable) return;

        for (const def of variable.defs) {
          if (
            def.node.type === 'VariableDeclarator' &&
            def.node.init &&
            def.node.init.type === 'CallExpression' &&
            def.node.init.callee.type === 'Identifier' &&
            def.node.init.callee.name === '$state'
          ) {
            // Only skip enforcement if we can prove it's a primitive literal
            if (isDefinitelyPrimitive(def.node.init)) {
              return;
            }

            // If TypeScript type info is available, check the actual type
            if (hasTypeInfo && !isMemberExpression) {
              const tsNode = getTSNode(expr);
              if (tsNode && isTypeScriptPrimitive(tsNode)) {
                return;
              }
            }

            // Skip property access unless it's a complex type
            if (isMemberExpression) {
              // If TypeScript type information is available, use it
              if (hasTypeInfo) {
                const tsNode = getTSNode(expr);
                if (tsNode && isTypeScriptPrimitive(tsNode)) {
                  return;
                }
                // Property is complex type - fall through to require snapshot
              } else {
                // No TypeScript info - skip all property access
                return;
              }
            }

            const parent = expr.parent;
            const isSnapshotCall =
              parent?.type === 'CallExpression' &&
              parent.callee.type === 'MemberExpression' &&
              parent.callee.object.type === 'Identifier' &&
              parent.callee.object.name === '$state' &&
              parent.callee.property.type === 'Identifier' &&
              parent.callee.property.name === 'snapshot';

            if (!isSnapshotCall) {
              const exprText = sourceCode.getText(expr as unknown as Rule.Node);
              context.report({
                node: expr,
                messageId: 'requireSnapshot',
                data: { name: exprText },
                fix(fixer) {
                  return fixer.replaceText(expr, `$state.snapshot(${exprText})`);
                },
              });
            }
          }
        }
      }

      // Recursively check inside ObjectExpression
      if (expr.type === 'ObjectExpression') {
        (expr as TSESTree.ObjectExpression).properties.forEach((prop: TSESTree.Property | TSESTree.SpreadElement) => {
          if (prop.type === 'Property' && prop.value) {
            checkExpression(prop.value, windowCallNode);
          }
        });
      }

      // Recursively check inside ArrayExpression
      if (expr.type === 'ArrayExpression') {
        (expr as TSESTree.ArrayExpression).elements.forEach(
          (element: TSESTree.Expression | TSESTree.SpreadElement | null) => {
            if (element) {
              checkExpression(element, windowCallNode);
            }
          }
        );
      }
    };

    return {
      CallExpression(node: Rule.Node) {
        const callExpr = node as unknown as TSESTree.CallExpression;
        // Match window.* calls
        if (
          callExpr.callee.type === 'MemberExpression' &&
          callExpr.callee.object.type === 'Identifier' &&
          callExpr.callee.object.name === 'window'
        ) {
          callExpr.arguments.forEach((arg: TSESTree.CallExpressionArgument) => {
            checkExpression(arg, callExpr);
          });
        }
      },
    };
  },
};

export default snapshotRequired;
