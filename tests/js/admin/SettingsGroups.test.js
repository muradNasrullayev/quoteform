/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SettingsPanel from '../../../admin-src/panels/SettingsPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { indexErrors } from '../../../admin-src/state/errors';

const settings = {
	currency: 'USD',
	currency_position: 'before',
	decimals: 2,
	submit_label: 'Get my quote',
	success_action: 'message',
	success_message: 'Thanks.',
	redirect_url: '',
	save_resume: false,
	store_ip: true,
};

// Exposes the live store as JSON text so a test can read what is actually
// held in `schema.settings`, not just what a control happens to render.
// The same probe-inside-the-provider approach StoreContext.test.js already
// uses for `useDispatch`.
function Probe() {
	const { schema } = useStore();

	return <pre data-testid="settings-probe">{ schema ? JSON.stringify( schema.settings ) : '' }</pre>;
}

function Harness( { errorIndex = indexErrors( [] ) } ) {
	const dispatch = useDispatch();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( {
							id: 1,
							title: 'Form',
							schema: {
								version: 1,
								settings,
								fields: {},
								steps: [],
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
			<Probe />
			<SettingsPanel errorIndex={ errorIndex } />
		</>
	);
}

async function renderLoaded( props = {} ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness { ...props } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

describe( 'settings groups', () => {
	it( 'groups the settings under three headings', async () => {
		await renderLoaded();

		for ( const name of [ 'Money', 'After submitting', 'Visitors' ] ) {
			expect( screen.getByRole( 'heading', { name } ) ).toBeInTheDocument();
		}
	} );

	it( 'puts each control under its heading', async () => {
		await renderLoaded();

		const money = screen.getByRole( 'heading', { name: 'Money' } ).closest( '.quoteform_settings-group' );
		const visitors = screen.getByRole( 'heading', { name: 'Visitors' } ).closest( '.quoteform_settings-group' );

		expect( money ).toContainElement( screen.getByLabelText( 'Currency' ) );
		expect( money ).toContainElement( screen.getByLabelText( 'Decimal places' ) );
		expect( visitors ).toContainElement( screen.getByLabelText( 'Let visitors save and resume' ) );
	} );

	it( 'keeps the success action a select', async () => {
		await renderLoaded();

		expect( screen.getByRole( 'combobox', { name: 'After a successful submission' } ) ).toBeInTheDocument();
	} );
} );
