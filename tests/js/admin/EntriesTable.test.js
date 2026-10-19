/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EntriesTable, { tableCaption } from '../../../admin-src/entries/EntriesTable';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

function item( id, extra = {} ) {
	return {
		id,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: true,
		name: 'Jane Doe',
		email: 'jane@example.com',
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25, 2026 1:30 am', full: '2026-09-25 01:30:00 +04', iso: '2026-09-24T21:30:00Z' },
		...extra,
	};
}

function setup( overrides = {} ) {
	const props = {
		items: [ item( 41, { is_read: false } ), item( 40 ) ],
		filters: DEFAULT_FILTERS,
		onSort: jest.fn(),
		selected: new Set(),
		onToggle: jest.fn(),
		onToggleAll: jest.fn(),
		entryHref: ( id ) => `?page=quoteform-entries&entry=${ id }`,
		onOpen: jest.fn(),
		formHref: ( formId ) => `admin.php?page=quoteform&form=${ formId }`,
		canDelete: true,
		confirmingId: null,
		onAskDelete: jest.fn(),
		onConfirmDelete: jest.fn(),
		onCancelDelete: jest.fn(),
		deleteButtonRef: jest.fn(),
		busy: false,
		...overrides,
	};

	render( <EntriesTable { ...props } /> );

	return props;
}

function row( id ) {
	return screen.getByRole( 'rowheader', { name: new RegExp( `#${ id }` ) } ).closest( 'tr' );
}

describe( 'EntriesTable', () => {
	it( 'sits in a named, keyboard-scrollable region with a caption', () => {
		setup();

		const region = screen.getByRole( 'region', { name: 'Entries table' } );

		expect( region ).toHaveAttribute( 'tabindex', '0' );
		expect( within( region ).getByRole( 'table', { name: 'Entries, newest first' } ) ).toBeInTheDocument();
	} );

	it( 'marks unread entries as New and bold', () => {
		setup();

		expect( row( 41 ) ).toHaveClass( 'quoteform_entries__row--unread' );
		expect( within( row( 41 ) ).getByText( 'New' ) ).toBeInTheDocument();
		expect( row( 40 ) ).not.toHaveClass( 'quoteform_entries__row--unread' );
		expect( within( row( 40 ) ).queryByText( 'New' ) ).not.toBeInTheDocument();
	} );

	it( 'shows the name and a mailto link, or a dash when there is neither', () => {
		setup( { items: [ item( 41 ), item( 42, { name: '', email: '' } ) ] } );

		expect( within( row( 41 ) ).getByText( 'Jane Doe' ) ).toBeInTheDocument();
		expect( within( row( 41 ) ).getByRole( 'link', { name: 'jane@example.com' } ) ).toHaveAttribute( 'href', 'mailto:jane@example.com' );
		expect( within( row( 42 ) ).getByText( '—' ) ).toBeInTheDocument();
	} );

	it( 'renders submitted text as text, never as markup', () => {
		setup( { items: [ item( 41, { name: '<b>Jane</b><img src=x onerror=alert(1)>' } ) ] } );

		expect( within( row( 41 ) ).getByText( '<b>Jane</b><img src=x onerror=alert(1)>' ) ).toBeInTheDocument();
		expect( row( 41 ).querySelector( 'b, img' ) ).toBeNull();
	} );

	it( 'links the form to its editor, or says the form is gone', () => {
		setup( { items: [ item( 41 ), item( 42, { form_title: null } ) ] } );

		expect( within( row( 41 ) ).getByRole( 'link', { name: 'Cleaning quote' } ) ).toHaveAttribute( 'href', 'admin.php?page=quoteform&form=7' );
		expect( within( row( 42 ) ).getByText( '(deleted form)' ) ).toBeInTheDocument();
	} );

	it( 'shows the form name without a link to someone who cannot edit forms', () => {
		setup( { formHref: () => null } );

		expect( within( row( 41 ) ).getByText( 'Cleaning quote' ) ).toBeInTheDocument();
		expect( within( row( 41 ) ).queryByRole( 'link', { name: 'Cleaning quote' } ) ).not.toBeInTheDocument();
	} );

	it( 'explains a missing total', () => {
		setup( { items: [ item( 41, { total: null, total_display: '' } ) ] } );

		expect( within( row( 41 ) ).getByText( 'Calculation failed' ) ).toBeInTheDocument();
		expect( within( row( 41 ) ).getByText( '—' ) ).toBeInTheDocument();
	} );

	it( 'gives the date its full form on hover and a machine-readable value', () => {
		setup();

		const time = within( row( 41 ) ).getByText( 'Sep 25, 2026 1:30 am' );

		expect( time.tagName ).toBe( 'TIME' );
		expect( time ).toHaveAttribute( 'title', '2026-09-25 01:30:00 +04' );
		expect( time ).toHaveAttribute( 'datetime', '2026-09-24T21:30:00Z' );
	} );

	it( 'announces the sort only on the active column and asks to sort on click', async () => {
		const props = setup( { filters: { ...DEFAULT_FILTERS, orderby: 'total', order: 'asc' } } );
		const user = userEvent.setup();

		expect( screen.getByRole( 'columnheader', { name: /Total/ } ) ).toHaveAttribute( 'aria-sort', 'ascending' );
		expect( screen.getByRole( 'columnheader', { name: /Date/ } ) ).not.toHaveAttribute( 'aria-sort' );
		expect( screen.getByRole( 'table', { name: 'Entries, lowest total first' } ) ).toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'Date' } ) );

		expect( props.onSort ).toHaveBeenCalledWith( 'date' );
	} );

	it( 'labels every checkbox and selects all on the page', async () => {
		const props = setup( { selected: new Set( [ 41 ] ) } );
		const user = userEvent.setup();

		expect( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) ).toBeChecked();
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) ).not.toBeChecked();

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) );
		expect( props.onToggle ).toHaveBeenCalledWith( 40 );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } ) );
		expect( props.onToggleAll ).toHaveBeenCalledWith( true );
	} );

	it( 'opens an entry in place on a plain click but lets a modified click open a new tab', () => {
		// jsdom real naviqasiya etmir və bunu konsola yazır; testin sonunda default-u özümüz dayandırırıq.
		const stopNavigation = ( event ) => event.preventDefault();
		document.addEventListener( 'click', stopNavigation );

		try {
			const props = setup();
			const view = screen.getByRole( 'link', { name: 'View entry #41' } );

			expect( view ).toHaveAttribute( 'href', '?page=quoteform-entries&entry=41' );

			fireEvent.click( view, { button: 0, ctrlKey: true } );
			expect( props.onOpen ).not.toHaveBeenCalled();

			fireEvent.click( view, { button: 0 } );
			expect( props.onOpen ).toHaveBeenCalledWith( 41 );
		} finally {
			document.removeEventListener( 'click', stopNavigation );
		}
	} );

	it( 'offers Delete only to someone allowed to delete, with a confirmation', async () => {
		const props = setup( { confirmingId: 41 } );
		const user = userEvent.setup();

		expect( screen.getByRole( 'button', { name: 'Delete entry #41' } ) ).toBeInTheDocument();
		expect( screen.getByText( 'Delete entry #41? This cannot be undone.' ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Delete permanently' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );
		expect( props.onCancelDelete ).toHaveBeenCalledWith( expect.objectContaining( { id: 41 } ) );
	} );

	it( 'hides Delete from someone who may only read', () => {
		setup( { canDelete: false } );

		expect( screen.queryByRole( 'button', { name: /Delete entry/ } ) ).not.toBeInTheDocument();
	} );
} );

describe( 'tableCaption', () => {
	it( 'describes all four orders', () => {
		expect( tableCaption( DEFAULT_FILTERS ) ).toBe( 'Entries, newest first' );
		expect( tableCaption( { ...DEFAULT_FILTERS, order: 'asc' } ) ).toBe( 'Entries, oldest first' );
		expect( tableCaption( { ...DEFAULT_FILTERS, orderby: 'total' } ) ).toBe( 'Entries, highest total first' );
		expect( tableCaption( { ...DEFAULT_FILTERS, orderby: 'total', order: 'asc' } ) ).toBe( 'Entries, lowest total first' );
	} );
} );
