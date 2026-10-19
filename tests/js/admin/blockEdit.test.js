/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Edit from '../../../admin-src/block/Edit';
import { listForms } from '../../../admin-src/api/client';
import metadata from '../../../includes/Rendering/block.json';

jest.mock( '../../../admin-src/api/client', () => ( {
	listForms: jest.fn(),
} ) );

function page( forms, totalPages = 1 ) {
	return { forms, total: forms.length, totalPages };
}

function setup( attributes = { formId: 0 } ) {
	const user = userEvent.setup();
	const setAttributes = jest.fn();

	render( <Edit attributes={ attributes } setAttributes={ setAttributes } /> );

	return { user, setAttributes };
}

describe( 'the block editor component', () => {
	beforeEach( () => {
		listForms.mockReset();
	} );

	it( 'offers every saved form by name', async () => {
		listForms.mockResolvedValue(
			page( [
				{ id: 7, title: 'Cleaning quote' },
				{ id: 9, title: 'Removals quote' },
			] )
		);

		setup();

		const chooser = await screen.findByLabelText( 'Which form?' );

		expect(
			Array.from( chooser.options ).map( ( option ) => option.textContent )
		).toEqual( [ 'Choose a form…', 'Cleaning quote', 'Removals quote' ] );
	} );

	it( 'stores the chosen form as a number, which is what the attribute declares', async () => {
		listForms.mockResolvedValue( page( [ { id: 7, title: 'Cleaning quote' } ] ) );

		const { user, setAttributes } = setup();

		await user.selectOptions( await screen.findByLabelText( 'Which form?' ), '7' );

		expect( setAttributes ).toHaveBeenCalledWith( { formId: 7 } );
		expect( metadata.attributes.formId.type ).toBe( 'number' );
	} );

	it( 'names the chosen form rather than pretending to render it', async () => {
		listForms.mockResolvedValue( page( [ { id: 7, title: 'Cleaning quote' } ] ) );

		setup( { formId: 7 } );

		expect(
			await screen.findByText( 'Visitors will see “Cleaning quote” here.' )
		).toBeInTheDocument();
	} );

	/**
	 * Silinmiş və ya zibilə atılmış forma: `render_callback` boş sətir
	 * qaytarır, yəni ziyarətçi HEÇ NƏ görür. Redaktor bunu susaraq
	 * keçirməməlidir.
	 */
	it( 'warns when the block points at a form that is no longer there', async () => {
		listForms.mockResolvedValue( page( [ { id: 9, title: 'Removals quote' } ] ) );

		setup( { formId: 7 } );

		expect(
			await screen.findByText(
				'This block points at form 7, which is no longer available. Nothing will be shown to visitors.'
			)
		).toBeInTheDocument();
	} );

	it( 'says so when there is nothing to choose from yet', async () => {
		listForms.mockResolvedValue( page( [] ) );

		setup();

		expect(
			await screen.findByText(
				'There are no forms to show yet. Open Quoteform in the admin menu and create one.'
			)
		).toBeInTheDocument();
	} );

	it( 'explains a refusal instead of showing an empty chooser', async () => {
		listForms.mockRejectedValue( { code: 'rest_forbidden', status: 403 } );

		setup();

		expect(
			await screen.findByText(
				'Your forms could not be loaded. Editing forms needs the “qform_manage_forms” capability.'
			)
		).toBeInTheDocument();
	} );

	/**
	 * `block.json` `"multiple": true` deyir, yəni bir yazıda iki blok ola
	 * bilər. Sabit `id` o halda səhifəyə iki eyni `id` qoyar və HƏR İKİ
	 * `<label for>` birinci blokun seçiminə işarə edər — ikinci blokun
	 * etiketi yanlış nəzarəti fokuslayardı.
	 */
	it( 'gives each block on the page its own control id', async () => {
		listForms.mockResolvedValue( page( [ { id: 7, title: 'Cleaning quote' } ] ) );

		render(
			<>
				<Edit attributes={ { formId: 0 } } setAttributes={ jest.fn() } />
				<Edit attributes={ { formId: 0 } } setAttributes={ jest.fn() } />
			</>
		);

		const choosers = await screen.findAllByLabelText( 'Which form?' );

		expect( choosers ).toHaveLength( 2 );
		expect( choosers[ 0 ].id ).not.toBe( choosers[ 1 ].id );

		const labels = Array.from( document.querySelectorAll( 'label' ) );

		expect( labels.map( ( label ) => label.htmlFor ) ).toEqual(
			choosers.map( ( chooser ) => chooser.id )
		);
	} );

	it( 'collects every page of the list, not just the first', async () => {
		listForms
			.mockResolvedValueOnce( page( [ { id: 1, title: 'One' } ], 2 ) )
			.mockResolvedValueOnce( page( [ { id: 2, title: 'Two' } ], 2 ) );

		setup();

		const chooser = await screen.findByLabelText( 'Which form?' );

		await waitFor( () => expect( chooser.options ).toHaveLength( 3 ) );

		expect( listForms ).toHaveBeenCalledTimes( 2 );
	} );
} );

describe( 'the block registration', () => {
	beforeAll( () => {
		require( '../../../admin-src/block/index' );
	} );

	function registration() {
		return require( '@wordpress/blocks' ).registered.find(
			( item ) => item.name === metadata.name
		);
	}

	it( 'registers under the name the server registers, taken from the same file', () => {
		const entry = registration();

		expect( metadata.name ).toBe( 'quoteform/form' );
		expect( entry ).toBeDefined();
		expect( typeof entry.settings.edit ).toBe( 'function' );
	} );

	/**
	 * Başlıq və atributlar redaktora SERVERDƏN gəlir (orada tərcümə də
	 * olunur). Onları burada təkrar versək, tərcümə olunmamış mətn serverin
	 * göndərdiyini üstələyərdi.
	 */
	it( 'leaves the title and the attributes to the server', () => {
		const entry = registration();

		expect( entry.settings.title ).toBeUndefined();
		expect( entry.settings.attributes ).toBeUndefined();
	} );
} );
