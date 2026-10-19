import fixtures from '../../fixtures/money.json';
import { formatMoney } from '../../../frontend-src/runtime/format';

describe( 'money parity fixtures', () => {
	it.each( fixtures.cases.map( ( testCase ) => [ testCase.id, testCase ] ) )( '%s', ( id, testCase ) => {
		expect( formatMoney( testCase.amount, testCase.settings ) ).toBe( testCase.expect );
	} );
} );
