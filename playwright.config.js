const { BASE_URL } = require( './tests/e2e/helpers' );

module.exports = {
	testDir: './tests/e2e',
	timeout: 30000,
	retries: 0,
	use: {
		baseURL: BASE_URL,
		headless: true,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
};
