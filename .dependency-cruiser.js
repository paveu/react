/**
 * dependency-cruiser configuration for the React monorepo.
 *
 * Scope of this config is the runtime/devtools/RSC JS+Flow source under
 * `packages/*`. It is intentionally tailored to the active areas surfaced by
 * `context/map/artifact-1-territory.md` (the "territory" map), not to the whole
 * repo. The React Compiler lives under `compiler/` and is analyzed separately;
 * its Rust port (`compiler/crates`) is out of scope for dependency-cruiser.
 *
 * The rules below encode the layering hypothesis from the territory map:
 *   - `packages/shared` is the foundation (feature flags, ReactTypes, symbols).
 *   - `react-reconciler` is the runtime hub that renderers depend on.
 *   - DevTools backend reads reconciler/fiber internals (one-directional).
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'Circular dependencies make a change ripple unpredictably and are hard to test in isolation. Reported as a warning so we can triage by area.',
      severity: 'warn',
      from: {},
      to: {circular: true},
    },
    {
      name: 'shared-is-foundation',
      comment:
        'packages/shared is the foundation layer (feature flags, ReactTypes, symbols). It must not depend on any other React package, otherwise the "common denominator" stops being a leaf.',
      severity: 'error',
      from: {path: '^packages/shared/'},
      to: {
        path: '^packages/(?!shared/)[^/]+/',
        pathNot: 'node_modules',
      },
    },
    {
      name: 'no-orphans',
      comment:
        'Modules with no incoming and no outgoing dependencies are usually dead code or a sign of a missing barrel. Informational.',
      severity: 'info',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$', // dot files
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts)$',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-test',
      comment:
        'Production source should not import from __tests__ / __mocks__ folders.',
      severity: 'error',
      from: {pathNot: '(__tests__|__mocks__)'},
      to: {path: '(__tests__|__mocks__)'},
    },
  ],
  options: {
    /*
     * Only look at first-party React source. node_modules are not followed so
     * the graph stays about React's own architecture, not its dependencies.
     */
    doNotFollow: {
      path: 'node_modules',
    },
    /*
     * Skip noise that would otherwise dominate the graph: tests, fixtures,
     * build output, npm/umd wrappers and the Rust compiler crates.
     */
    exclude: {
      path: [
        'node_modules',
        '__tests__',
        '__mocks__',
        '/dist/',
        '/build/',
        '/npm/',
        '/umd/',
        '/cjs/',
        '\\.snap$',
        'compiler/crates',
      ],
    },
    moduleSystems: ['es6', 'cjs'],
    /*
     * React source is Flow-typed `.js`. dependency-cruiser's bundled acorn
     * build understands Flow syntax, so no extra parser config is needed; we
     * just make sure the common extensions are enhanced-resolved.
     */
    enhancedResolveOptions: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'packages/[^/]+/src/[^/]+',
      },
      archi: {
        collapsePattern:
          'packages/[^/]+/src/(components|backend|frontend|devtools|client|server)',
      },
    },
  },
};
