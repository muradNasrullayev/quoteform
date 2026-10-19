/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EditorScreen from '../../../admin-src/screens/EditorScreen';
import RulesPanel from '../../../admin-src/panels/RulesPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';
import { getForm } from '../../../admin-src/api/client';

// Yalnız `isRTL` saxtalaşdırılır — `__`, `_x`, `sprintf` realdır.
jest.mock( '@wordpress/i18n', () => ( {
	...jest.requireActual( '@wordpress/i18n' ),
	isRTL: () => true,
} ) );

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listForms: jest.fn(),
	getForm: jest.fn(),
	createForm: jest.fn(),
	updateForm: jest.fn(),
	deleteForm: jest.fn(),
} ) );

const schema = {
	version: 1,
	settings: {
		currency: 'USD',
		currency_position: 'before',
		decimals: 2,
		submit_label: 'Get my quote',
		success_action: 'message',
		success_message: 'Thanks.',
		redirect_url: '',
		save_resume: false,
		store_ip: false,
	},
	fields: {
		rooms: defaultField( 'number', 'rooms', 'Rooms' ),
		note: defaultField( 'text', 'note', 'Note' ),
	},
	steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms', 'note' ] } ],
	calculations: [ { key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true } ],
	rules: [
		{
			target: { kind: 'field', key: 'note' },
			action: 'show',
			match: 'all',
			conditions: [ { field: 'rooms', operator: 'greater', value: '3' } ],
		},
	],
	notifications: [],
};

beforeEach( () => {
	jest.resetAllMocks();
	getForm.mockResolvedValue( { id: 7, title: 'Cleaning quote', schema } );
} );

describe( 'arrows in a right-to-left admin', () => {
	it( 'points the back arrow to the right', async () => {
		render(
			<StoreProvider>
				<EditorScreen formId={ 7 } onClose={ () => {} } />
			</StoreProvider>
		);

		// Yükləmə vəziyyətinin sadə "Back" düyməsi yox — üst zolağınkı.
		await screen.findByRole( 'button', { name: 'Save' } );

		const back = screen.getByRole( 'button', { name: 'Back to all forms' } );
		const arrow = back.querySelector( '[aria-hidden="true"]' );

		expect( arrow ).toHaveTextContent( '→' );
	} );

	it( 'points the rule sentence arrow to the left', async () => {
		function Harness() {
			const dispatch = useDispatch();
			const { schema: loaded } = useStore();

			return (
				<>
					<button onClick={ () => dispatch( loadSucceeded( { id: 1, title: 'F', schema } ) ) }>
						load
					</button>
					{ loaded && <RulesPanel errorIndex={ indexErrors( [] ) } /> }
				</>
			);
		}

		render(
			<StoreProvider>
				<Harness />
			</StoreProvider>
		);
		await userEvent.click( screen.getByRole( 'button', { name: 'load' } ) );

		const words = Array.from(
			document.querySelectorAll( '.quoteform_rule__sentence .quoteform_rule__word' )
		).map( ( el ) => el.textContent );

		expect( words ).toContain( '←' );
		expect( words ).not.toContain( '→' );
	} );
} );
