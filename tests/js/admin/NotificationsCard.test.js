/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NotificationsCard from '../../../admin-src/panels/NotificationsCard';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { indexErrors } from '../../../admin-src/state/errors';

function Probe() {
	const { schema } = useStore();

	return <pre data-testid="probe">{ schema ? JSON.stringify( schema.notifications ) : '' }</pre>;
}

function Harness( { errorIndex = indexErrors( [] ), notifications = [] } ) {
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
								settings: {},
								fields: {},
								steps: [],
								calculations: [],
								rules: [],
								notifications,
							},
						} )
					)
				}
			>
				load
			</button>
			<Probe />
			<NotificationsCard errorIndex={ errorIndex } />
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

const toggleLabel = 'Email me when someone submits this form';

describe( 'NotificationsCard', () => {
	it( 'is off and hides the fields when the list is empty', async () => {
		await renderLoaded();

		expect( screen.getByRole( 'heading', { name: 'Notifications' } ) ).toBeInTheDocument();
		expect( screen.getByLabelText( toggleLabel ) ).not.toBeChecked();
		expect( screen.queryByLabelText( 'Send to' ) ).not.toBeInTheDocument();
		expect( screen.queryByLabelText( 'Subject' ) ).not.toBeInTheDocument();
	} );

	it( 'creates the notification and shows both fields when checked', async () => {
		const user = await renderLoaded();

		await user.click( screen.getByLabelText( toggleLabel ) );

		expect( screen.getByLabelText( toggleLabel ) ).toBeChecked();
		expect( screen.getByLabelText( 'Send to' ) ).toHaveValue( '' );
		expect( screen.getByLabelText( 'Subject' ) ).toHaveValue( 'New quote: {form_name} — {total}' );
		expect( JSON.parse( screen.getByTestId( 'probe' ).textContent )[ 0 ].enabled ).toBe( true );
	} );

	it( 'stores typed values', async () => {
		const user = await renderLoaded( {
			notifications: [ { type: 'admin', enabled: true, to: '', subject: 'S' } ],
		} );

		await user.type( screen.getByLabelText( 'Send to' ), 'a@b.co' );

		expect( JSON.parse( screen.getByTestId( 'probe' ).textContent )[ 0 ].to ).toBe( 'a@b.co' );
	} );

	it( 'shows the server errors next to their controls', async () => {
		await renderLoaded( {
			notifications: [ { type: 'admin', enabled: true, to: 'x', subject: '' } ],
			errorIndex: indexErrors( [
				{ path: 'notifications.0.to', code: 'invalid_email', message: 'Bad address.', context: {} },
				{ path: 'notifications.0.subject', code: 'too_long', message: 'Too long.', context: {} },
				{ path: 'notifications', code: 'invalid_type', message: 'List error.', context: {} },
			] ),
		} );

		expect( screen.getByLabelText( 'Send to' ) ).toHaveAccessibleDescription( /Bad address\./ );
		expect( screen.getByLabelText( 'Subject' ) ).toHaveAccessibleDescription( /Too long\./ );
		expect( screen.getByText( 'List error.' ) ).toBeInTheDocument();
	} );
} );
