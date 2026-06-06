module.exports = [
	{
		files: [
			'src/js/**/*.js'
		],
		languageOptions: {
			ecmaVersion: 2020,
			sourceType: 'module'
		},
		rules: {
			'no-unused-vars': 'off',
			'no-undef': 'off',
			'no-redeclare': 'off',
			'no-var': 'off',
			'prefer-const': 'off'
		}
	}
];
