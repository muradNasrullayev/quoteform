/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FormulaEditor from '../../../admin-src/panels/FormulaEditor';

function setup( props = {} ) {
	const user = userEvent.setup();
	const onChange = jest.fn();

	render(
		<FormulaEditor
			id="formula"
			label="Formula"
			value=""
			onChange={ onChange }
			knownVariables={ [ 'rooms', 'urgency', 'subtotal' ] }
			priceVariables={ [ 'urgency' ] }
			errors={ [] }
			{ ...props }
		/>
	);

	return { user, onChange };
}

// The textarea's own value is part of the text tree, so a bare
// findByText( /rooms.price/ ) passes whether or not the verdict ever mentions
// it. The verdict paragraph is the only thing under test in these cases.
function verdict() {
	return screen.findByRole( 'status' );
}

describe( 'FormulaEditor', () => {
	it( 'reports what the user types', async () => {
		const { user, onChange } = setup();

		await user.type( screen.getByLabelText( 'Formula' ), '1' );

		expect( onChange ).toHaveBeenCalledWith( '1' );
	} );

	it( 'says a valid formula is fine', async () => {
		setup( { value: '{rooms} * 50' } );

		expect( await screen.findByText( 'This formula is valid.' ) ).toBeInTheDocument();
	} );

	it( 'reports the engine’s own code for a broken formula', async () => {
		setup( { value: '{rooms} * ' } );

		expect( await screen.findByText( /unexpected_token/ ) ).toBeInTheDocument();
	} );

	it( 'names a variable the form does not have', async () => {
		setup( { value: '{ghost} + 1' } );

		expect( await screen.findByText( /ghost/ ) ).toBeInTheDocument();
	} );

	it( 'accepts the .price suffix against a price-bearing field', async () => {
		setup( { value: '{urgency.price}' } );

		expect( await screen.findByText( 'This formula is valid.' ) ).toBeInTheDocument();
	} );

	it( 'rejects .price on a field that carries no price, as the server does', async () => {
		setup( { value: '{rooms.price} + 1' } );

		const message = await verdict();

		expect( message ).toHaveTextContent(
			'Only “.price” works here, and only on a dropdown, radio or checkbox field: rooms.price.'
		);
		expect( message ).not.toHaveTextContent( 'This formula is valid.' );
	} );

	it( 'rejects .price on a calculation, as the server does', async () => {
		setup( { value: '{subtotal.price} + 1' } );

		const message = await verdict();

		expect( message ).toHaveTextContent(
			'Only “.price” works here, and only on a dropdown, radio or checkbox field: subtotal.price.'
		);
		expect( message ).not.toHaveTextContent( 'This formula is valid.' );
	} );

	it( 'rejects a suffix that is not exactly price, as the server does', async () => {
		setup( { value: '{urgency.foo} + 1' } );

		const message = await verdict();

		expect( message ).toHaveTextContent(
			'Only “.price” works here, and only on a dropdown, radio or checkbox field: urgency.foo.'
		);
		expect( message ).not.toHaveTextContent( 'This formula is valid.' );
	} );

	it( 'rejects a multi-dot reference, as the server does', async () => {
		setup( { value: '{urgency.price.each} + 1' } );

		const message = await verdict();

		expect( message ).toHaveTextContent(
			'Only “.price” works here, and only on a dropdown, radio or checkbox field: urgency.price.each.'
		);
		expect( message ).not.toHaveTextContent( 'This formula is valid.' );
	} );

	it( 'still names a dotted reference whose base does not exist at all', async () => {
		setup( { value: '{ghost.price} + 1' } );

		expect( await verdict() ).toHaveTextContent(
			'This formula uses something the form does not have: ghost.price.'
		);
	} );

	/**
	 * Spec §7.2: mühərrikin `eval()` işlətməməsinin İKİ səbəbindən biri məhz
	 * budur — ağac üzərində insani mesaj vermək. Mesajı forma sahibi görür,
	 * ona görə yeganə yeri builder-dir.
	 */
	it( 'asks whether a near-miss was meant to be the key it almost is', async () => {
		setup( { value: '{bathroms} + 1', knownVariables: [ 'rooms', 'bathrooms', 'total' ] } );

		expect( await verdict() ).toHaveTextContent(
			'There is no “bathroms” in this form — did you mean “bathrooms”?'
		);
	} );

	it( 'asks about the whole name, .price suffix included', async () => {
		setup( {
			value: '{urgensy.price} + 1',
			knownVariables: [ 'rooms', 'urgency' ],
			priceVariables: [ 'urgency' ],
		} );

		expect( await verdict() ).toHaveTextContent(
			'There is no “urgensy.price” in this form — did you mean “urgency.price”?'
		);
	} );

	/**
	 * Düzgün baza + səhv şəkilçi ayrıca haldır və onun ÖZ mesajı var, o
	 * mesaj isə təxmindən dəqiqdir: nəyin işlədiyini birbaşa deyir.
	 */
	it( 'leaves a wrong suffix on a real field to the message that already explains suffixes', async () => {
		setup( { value: '{urgency.prise} + 1' } );

		expect( await verdict() ).toHaveTextContent(
			'Only “.price” works here, and only on a dropdown, radio or checkbox field: urgency.prise.'
		);
	} );

	it( 'keeps the plain list when nothing is close enough to guess at', async () => {
		setup( { value: '{ghost} + 1' } );

		expect( await verdict() ).toHaveTextContent(
			'This formula uses something the form does not have: ghost.'
		);
	} );

	it( 'keeps the plain list when more than one name is unknown', async () => {
		setup( { value: '{bathroms} + {roomz}', knownVariables: [ 'rooms', 'bathrooms' ] } );

		expect( await verdict() ).toHaveTextContent(
			'This formula uses something the form does not have: bathroms, roomz.'
		);
	} );

	it( 'warns when the formula is over the 1000-character cap', async () => {
		setup( { value: `1 + ${ '1 + '.repeat( 300 ) }1` } );

		expect( await screen.findByText( /too long/ ) ).toBeInTheDocument();
	} );

	it( 'shows a server error rather than its own verdict', async () => {
		jest.useFakeTimers();

		try {
			setup( {
				value: '{rooms}',
				errors: [
					{
						path: 'calculations.0.expression',
						code: 'invalid_expression',
						message: 'The server rejected this formula.',
						context: { engine_code: 'unexpected_token', position: 3 },
					},
				],
			} );

			act( () => {
				jest.advanceTimersByTime( 200 );
			} );

			expect( screen.getByText( 'The server rejected this formula.' ) ).toBeInTheDocument();
			expect( screen.queryByText( 'This formula is valid.' ) ).not.toBeInTheDocument();
		} finally {
			jest.useRealTimers();
		}
	} );

	it( 'does not point aria-describedby at a verdict paragraph that has not rendered yet', () => {
		setup();

		expect( screen.getByLabelText( 'Formula' ) ).not.toHaveAttribute( 'aria-describedby' );
	} );

	it( 'says an empty formula needs one, rather than reporting a compiler error', async () => {
		setup( { value: '' } );

		expect( await screen.findByText( 'A calculation needs a formula.' ) ).toBeInTheDocument();
	} );

	it( 'lists the variables the form offers', () => {
		setup();

		expect( screen.getByText( '{rooms}' ) ).toBeInTheDocument();
		expect( screen.getByText( '{urgency}' ) ).toBeInTheDocument();
	} );

	it( 'offers .price only for the variables that actually have one', () => {
		setup();

		expect( screen.getByText( '{urgency.price}' ) ).toBeInTheDocument();
		expect( screen.queryByText( '{rooms.price}' ) ).not.toBeInTheDocument();
		expect( screen.queryByText( '{subtotal.price}' ) ).not.toBeInTheDocument();
	} );
} );
