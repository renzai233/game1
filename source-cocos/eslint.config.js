module.exports = [
    {
        files: ['**/*.ts'],
        ignores: [
            'library/',
            'temp/',
            'node_modules/',
            'build/',
            'assets/**/*.meta',
        ],
        languageOptions: {
            parser: require('@typescript-eslint/parser'),
            parserOptions: {
                ecmaVersion: 2021,
                sourceType: 'module',
                project: './tsconfig.json',
            },
        },
        plugins: {
            '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
            'prettier': require('eslint-plugin-prettier'),
        },
        rules: {
            'prettier/prettier': 'error',
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'indent': ['error', 4],
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['warn'],
            '@typescript-eslint/explicit-function-return-type': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/interface-name-prefix': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            'no-console': 'warn',
            'no-debugger': 'warn',
        },
    },
]; 