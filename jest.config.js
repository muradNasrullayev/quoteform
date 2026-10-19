module.exports = {
	projects: [
		{
			displayName: 'engine',
			testEnvironment: 'node',
			testMatch: [ '<rootDir>/tests/js/**/*.test.js' ],
			testPathIgnorePatterns: [
				'<rootDir>/tests/js/admin/',
				'<rootDir>/tests/js/frontend/',
			],
		},
		{
			displayName: 'admin',
			testEnvironment: 'jsdom',
			testMatch: [ '<rootDir>/tests/js/admin/**/*.test.js' ],
			setupFilesAfterEnv: [ '<rootDir>/tests/js/setup-admin.js' ],
			moduleNameMapper: {
				'\\.(css|scss)$': '<rootDir>/tests/js/admin/styleStub.js',
				'^@wordpress/element$': '<rootDir>/tests/js/admin/wpElementStub.js',
				'^@wordpress/blocks$': '<rootDir>/tests/js/admin/wpBlocksStub.js',
				'^@wordpress/block-editor$': '<rootDir>/tests/js/admin/wpBlockEditorStub.js',
				'^@wordpress/compose$': '<rootDir>/tests/js/admin/wpComposeStub.js',
			},
		},
		{
			displayName: 'frontend',
			testEnvironment: 'jsdom',
			testMatch: [ '<rootDir>/tests/js/frontend/**/*.test.js' ],
			moduleNameMapper: {
				'\\.(css|scss)$': '<rootDir>/tests/js/admin/styleStub.js',
			},
		},
	],
};
