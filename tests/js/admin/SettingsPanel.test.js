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

function readSettings() {
	return JSON.parse( screen.getByTestId( 'settings-probe' ).textContent );
}

describe( 'SettingsPanel', () => {
	it( 'shows the stored values', async () => {
		await renderLoaded();

		expect( screen.getByLabelText( 'Currency' ) ).toHaveValue( 'USD' );
		expect( screen.getByLabelText( 'Currency position' ) ).toHaveValue( 'before' );
		expect( screen.getByLabelText( 'Decimal places' ) ).toHaveValue( 2 );
		expect( screen.getByLabelText( 'Submit button label' ) ).toHaveValue( 'Get my quote' );
		expect( screen.getByLabelText( 'After a successful submission' ) ).toHaveValue( 'message' );
		expect( screen.getByLabelText( 'Success message' ) ).toHaveValue( 'Thanks.' );
		expect( screen.getByLabelText( 'Let visitors save and resume' ) ).not.toBeChecked();
		expect( screen.getByLabelText( 'Store the visitor’s IP address with each entry' ) ).toBeChecked();

		// The section is a labelled landmark, not just a div with a heading.
		expect( screen.getByRole( 'region', { name: 'Settings' } ) ).toBeInTheDocument();
	} );

	it( 'shows the success message when the action is message, and not the redirect', async () => {
		await renderLoaded();

		const successMessage = screen.getByLabelText( 'Success message' );

		expect( successMessage ).toBeInTheDocument();
		expect( successMessage.tagName ).toBe( 'TEXTAREA' );
		expect( screen.queryByLabelText( 'Redirect URL' ) ).not.toBeInTheDocument();
	} );

	it( 'swaps to the redirect URL when the action changes', async () => {
		const user = await renderLoaded();

		await user.selectOptions( screen.getByLabelText( 'After a successful submission' ), 'redirect' );

		expect( screen.getByLabelText( 'Redirect URL' ) ).toBeInTheDocument();
		expect( screen.queryByLabelText( 'Success message' ) ).not.toBeInTheDocument();
	} );

	it( 'keeps both success_message and redirect_url in the schema across an action round trip', async () => {
		const user = await renderLoaded();

		await user.clear( screen.getByLabelText( 'Success message' ) );
		await user.type( screen.getByLabelText( 'Success message' ), 'Updated message.' );

		await user.selectOptions( screen.getByLabelText( 'After a successful submission' ), 'redirect' );

		await user.type( screen.getByLabelText( 'Redirect URL' ), 'https://example.com' );

		await user.selectOptions( screen.getByLabelText( 'After a successful submission' ), 'message' );

		const stored = readSettings();

		expect( stored.success_message ).toBe( 'Updated message.' );
		expect( stored.redirect_url ).toBe( 'https://example.com' );
		expect( Object.keys( stored ) ).toHaveLength( 9 );
	} );

	it( 'renders the server error next to the control it belongs to', async () => {
		await renderLoaded( {
			errorIndex: indexErrors( [
				{
					path: 'settings.redirect_url',
					code: 'invalid_option',
					message: 'The redirect URL must start with http:// or https://.',
					context: {},
				},
				{
					path: 'settings.decimals',
					code: 'out_of_range',
					message: 'Between 0 and 6.',
					context: { min: 0, max: 6 },
				},
			] ),
		} );

		expect( screen.getByLabelText( 'Decimal places' ) ).toHaveAccessibleDescription(
			'Between 0 and 6.'
		);

		// The action is `message`, so the redirect control -- and the error
		// that belongs to it -- is not rendered at all.
		expect( screen.queryByLabelText( 'Redirect URL' ) ).not.toBeInTheDocument();
	} );

	it( 'routes an error on each of the nine settings paths to its own control', async () => {
		await renderLoaded( {
			errorIndex: indexErrors( [
				{ path: 'settings.currency', code: 'invalid_format', message: 'Currency error.', context: {} },
				{
					path: 'settings.currency_position',
					code: 'invalid_option',
					message: 'Currency position error.',
					context: {},
				},
				{
					path: 'settings.decimals',
					code: 'out_of_range',
					message: 'Decimals error.',
					context: { min: 0, max: 6 },
				},
				{
					path: 'settings.submit_label',
					code: 'invalid_type',
					message: 'Submit label error.',
					context: {},
				},
				{
					path: 'settings.success_action',
					code: 'invalid_option',
					message: 'Success action error.',
					context: {},
				},
				{
					path: 'settings.success_message',
					code: 'invalid_type',
					message: 'Success message error.',
					context: {},
				},
				{
					path: 'settings.redirect_url',
					code: 'invalid_option',
					message: 'Redirect url error.',
					context: {},
				},
				{
					path: 'settings.save_resume',
					code: 'invalid_type',
					message: 'Save resume error.',
					context: {},
				},
				{ path: 'settings.store_ip', code: 'invalid_type', message: 'Store ip error.', context: {} },
			] ),
		} );

		expect( screen.getByLabelText( 'Currency' ) ).toHaveAccessibleDescription(
			'Currency error. A three-letter code such as USD or EUR.'
		);
		expect( screen.getByLabelText( 'Currency position' ) ).toHaveAccessibleDescription(
			'Currency position error.'
		);
		expect( screen.getByLabelText( 'Decimal places' ) ).toHaveAccessibleDescription(
			'Decimals error.'
		);
		expect( screen.getByLabelText( 'Submit button label' ) ).toHaveAccessibleDescription(
			'Submit label error.'
		);
		expect( screen.getByLabelText( 'After a successful submission' ) ).toHaveAccessibleDescription(
			'Success action error.'
		);
		expect( screen.getByLabelText( 'Success message' ) ).toHaveAccessibleDescription(
			'Success message error.'
		);
		expect( screen.getByLabelText( 'Let visitors save and resume' ) ).toHaveAccessibleDescription(
			'Save resume error.'
		);
		expect(
			screen.getByLabelText( 'Store the visitor’s IP address with each entry' )
		).toHaveAccessibleDescription( 'Store ip error.' );

		// success_action is `message`, so the redirect control -- and its
		// error -- stays out of the DOM entirely.
		expect( screen.queryByLabelText( 'Redirect URL' ) ).not.toBeInTheDocument();
	} );

	it( 'edits a setting through the store', async () => {
		const user = await renderLoaded();

		await user.clear( screen.getByLabelText( 'Currency' ) );
		await user.type( screen.getByLabelText( 'Currency' ), 'EUR' );

		expect( screen.getByLabelText( 'Currency' ) ).toHaveValue( 'EUR' );
	} );

	const wiringCases = [
		{
			key: 'currency_position',
			prep: null,
			act: ( user ) => user.selectOptions( screen.getByLabelText( 'Currency position' ), 'after' ),
			expected: 'after',
		},
		{
			key: 'decimals',
			prep: null,
			act: async ( user ) => {
				await user.clear( screen.getByLabelText( 'Decimal places' ) );
				await user.type( screen.getByLabelText( 'Decimal places' ), '4' );
			},
			expected: 4,
		},
		{
			key: 'submit_label',
			prep: null,
			act: async ( user ) => {
				await user.clear( screen.getByLabelText( 'Submit button label' ) );
				await user.type( screen.getByLabelText( 'Submit button label' ), 'Get a quote now' );
			},
			expected: 'Get a quote now',
		},
		{
			key: 'success_action',
			prep: null,
			act: ( user ) =>
				user.selectOptions( screen.getByLabelText( 'After a successful submission' ), 'redirect' ),
			expected: 'redirect',
		},
		{
			key: 'success_message',
			prep: null,
			act: async ( user ) => {
				await user.clear( screen.getByLabelText( 'Success message' ) );
				await user.type( screen.getByLabelText( 'Success message' ), 'All done!' );
			},
			expected: 'All done!',
		},
		{
			key: 'redirect_url',
			prep: ( user ) =>
				user.selectOptions( screen.getByLabelText( 'After a successful submission' ), 'redirect' ),
			act: ( user ) => user.type( screen.getByLabelText( 'Redirect URL' ), 'https://example.org' ),
			expected: 'https://example.org',
		},
		{
			key: 'save_resume',
			prep: null,
			act: ( user ) => user.click( screen.getByLabelText( 'Let visitors save and resume' ) ),
			expected: true,
		},
		{
			key: 'store_ip',
			prep: null,
			act: ( user ) =>
				user.click( screen.getByLabelText( 'Store the visitor’s IP address with each entry' ) ),
			expected: false,
		},
	];

	test.each( wiringCases )(
		'wires settings.$key to its own control and nothing else',
		async ( { prep, act, key, expected } ) => {
			const user = await renderLoaded();

			if ( prep ) {
				await prep( user );
			}

			const before = readSettings();

			await act( user );

			const after = readSettings();

			expect( after[ key ] ).toEqual( expected );

			Object.keys( before ).forEach( ( otherKey ) => {
				if ( otherKey === key ) {
					return;
				}

				expect( after[ otherKey ] ).toEqual( before[ otherKey ] );
			} );
		}
	);

	it( 'renders nothing at all before a form is loaded', () => {
		render(
			<StoreProvider>
				<SettingsPanel errorIndex={ indexErrors( [] ) } />
			</StoreProvider>
		);

		expect( screen.queryByLabelText( 'Currency' ) ).not.toBeInTheDocument();
	} );
} );
