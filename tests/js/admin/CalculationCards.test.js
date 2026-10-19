/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CalculationsPanel from '../../../admin-src/panels/CalculationsPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { indexErrors } from '../../../admin-src/state/errors';

function schemaWith( { calculations, fields = {} } ) {
	return {
		version: 1,
		settings: {},
		fields,
		steps: [],
		calculations,
		rules: [],
		notifications: [],
	};
}

function Harness( { errorIndex = indexErrors( [] ), calculations, fields } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( { id: 1, title: 'F', schema: schemaWith( { calculations, fields } ) } )
					)
				}
			>
				load
			</button>
			{ schema && <CalculationsPanel errorIndex={ errorIndex } /> }
		</>
	);
}

async function setup( props ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness { ...props } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

async function renderWithTotal() {
	return setup( {
		calculations: [ { key: 'total', label: 'Total', expression: '1', visible: true } ],
	} );
}

const visibleText = ( label ) =>
	Array.from( label.childNodes )
		.filter( ( node ) => ! ( node.classList && node.classList.contains( 'screen-reader-text' ) ) )
		.map( ( node ) => node.textContent )
		.join( '' );

const visibleLabelOf = ( name ) => {
	const control = screen.getByLabelText( name );

	return visibleText( document.querySelector( `label[for="${ control.id }"]` ) );
};

describe( 'calculation cards', () => {
	it( 'shows short labels for key, label and formula', async () => {
		await renderWithTotal();

		expect( visibleLabelOf( 'Calculation 1 key' ) ).toBe( 'key' );
		expect( visibleLabelOf( 'Calculation 1 label' ) ).toBe( 'label' );
		expect( visibleLabelOf( 'Calculation 1 formula' ) ).toBe( 'formula' );
	} );

	it( 'keeps the whole visibility label, since a short one would not be part of its name', async () => {
		await renderWithTotal();

		expect( visibleLabelOf( 'Show calculation 1 to the visitor' ) ).toBe(
			'Show calculation 1 to the visitor'
		);
	} );

	it( 'shows the key as a formula token in the card header', async () => {
		await renderWithTotal();

		expect( document.querySelector( '.quoteform_calculation__key' ) ).toHaveTextContent( '{total}' );
	} );
} );
