/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import StepsPanel from '../../../admin-src/panels/StepsPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function Harness( { fields, steps, errorIndex } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( {
							id: 1,
							title: 'F',
							schema: {
								version: 1,
								settings: {},
								fields,
								steps,
								calculations: [],
								rules: [],
								notifications: [],
							},
						} )
					)
				}
			>
				load
			</button>
			{ schema && <StepsPanel errorIndex={ errorIndex } /> }
		</>
	);
}

async function renderPanel( { fields = {}, steps = [], errorIndex = indexErrors( [] ) } = {} ) {
	const user = userEvent.setup();

	const { container } = render(
		<StoreProvider>
			<Harness fields={ fields } steps={ steps } errorIndex={ errorIndex } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return { user, container };
}

const rooms = defaultField( 'number', 'rooms', 'Rooms' );

async function renderWithOneStep() {
	return renderPanel( {
		fields: { rooms },
		steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
	} );
}

const visibleText = ( label ) =>
	Array.from( label.childNodes )
		.filter( ( node ) => ! ( node.classList && node.classList.contains( 'screen-reader-text' ) ) )
		.map( ( node ) => node.textContent )
		.join( '' );

describe( 'step cards', () => {
	it( 'shows short labels but keeps the numbered names', async () => {
		await renderWithOneStep();

		const title = screen.getByLabelText( 'Step 1 title' );

		expect( visibleText( document.querySelector( `label[for="${ title.id }"]` ) ) ).toBe( 'title' );
		expect( screen.getByLabelText( 'Step 1 description' ) ).toBeInTheDocument();
	} );

	it( 'numbers each step in its header', async () => {
		await renderWithOneStep();

		expect( document.querySelector( '.quoteform_step__number' ) ).toHaveTextContent( '1' );
	} );

	it( 'shows a field chip whose button is still named for what it does', async () => {
		await renderWithOneStep();

		const takeOff = screen.getByRole( 'button', { name: /^Take off this step: / } );

		expect( takeOff.closest( '.quoteform_chip' ) ).not.toBeNull();
	} );
} );
