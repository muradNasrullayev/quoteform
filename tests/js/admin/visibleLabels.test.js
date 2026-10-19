/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EditorScreen from '../../../admin-src/screens/EditorScreen';
import { StoreProvider } from '../../../admin-src/state/StoreContext';
import { getForm } from '../../../admin-src/api/client';

// EditorScreen.test.js-dəki naxışın eynisi: `jest.mock()` modulu bütöv
// avtomock edir, `ApiError` də daxil olmaqla. Avtomock edilmiş sinif
// konstruktorda verilən vəziyyəti sükutla atır, ona görə real sinfi
// `jest.requireActual` ilə saxlayıb yalnız API funksiyalarını stub edirik.
jest.mock( '../../../admin-src/api/client', () => {
	const actual = jest.requireActual( '../../../admin-src/api/client' );

	return {
		...actual,
		listForms: jest.fn(),
		getForm: jest.fn(),
		createForm: jest.fn(),
		updateForm: jest.fn(),
		deleteForm: jest.fn(),
	};
} );

const form = {
	id: 7,
	title: 'Cleaning',
	schema: {
		version: 1,
		settings: {
			currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Go',
			success_action: 'message', success_message: 'Thanks', redirect_url: '',
			save_resume: false, store_ip: false,
		},
		fields: {
			rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', placeholder: '', required: false, default: 1 },
		},
		steps: [ { key: 'one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		calculations: [ { key: 'total', label: 'Total', expression: '{rooms}', visible: true } ],
		rules: [
			{
				target: { kind: 'field', key: 'rooms' },
				action: 'hide',
				match: 'all',
				conditions: [ { field: 'rooms', operator: 'equals', value: '1' } ],
			},
		],
		notifications: [],
	},
};

async function openEditor() {
	getForm.mockResolvedValue( form );
	render(
		<StoreProvider>
			<EditorScreen formId={ 7 } onClose={ jest.fn() } />
		</StoreProvider>
	);
	await screen.findByLabelText( 'Form title' );
}

beforeEach( () => {
	jest.clearAllMocks();
} );

const TABS = [ 'Fields', 'Steps', 'Pricing', 'Rules', 'Settings' ];

// `hideLabel` yalnız bu iki yerdə icazəlidir (spec §5.6).
const mayHide = ( label ) =>
	label.htmlFor === 'quoteform_form-title' ||
	/^quoteform_rule-\d+-/.test( label.htmlFor ) ||
	/^quoteform_shortcode-\d+$/.test( label.htmlFor );

const visibleText = ( label ) =>
	Array.from( label.childNodes )
		.filter( ( node ) => ! ( node.classList && node.classList.contains( 'screen-reader-text' ) ) )
		.map( ( node ) => node.textContent )
		.join( '' )
		.trim();

describe( 'every label a sighted person needs is on screen', () => {
	it.each( TABS )( 'in the %s section', async ( name ) => {
		const user = userEvent.setup();

		await openEditor();
		await user.click( screen.getByRole( 'button', { name } ) );

		if ( name === 'Fields' ) {
			await user.click( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) );
		}

		const labels = Array.from( document.querySelectorAll( 'label' ) );

		expect( labels.length ).toBeGreaterThan( 0 );

		for ( const label of labels ) {
			if ( label.hasAttribute( 'data-quoteform-hidden-label' ) ) {
				expect( mayHide( label ) ).toBe( true );
			} else {
				expect( visibleText( label ) ).not.toBe( '' );
			}
		}
	} );
} );
