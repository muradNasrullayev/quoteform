/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import EntriesTable from '../../../admin-src/entries/EntriesTable';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

function item( id ) {
	return {
		id,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: true,
		name: 'Jane Doe',
		email: 'jane@example.com',
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25, 2026', full: '2026-09-25 01:30:00', iso: '2026-09-24T21:30:00Z' },
	};
}

function table( selected ) {
	return (
		<EntriesTable
			items={ [ item( 41 ), item( 40 ), item( 39 ) ] }
			filters={ DEFAULT_FILTERS }
			onSort={ jest.fn() }
			selected={ selected }
			onToggle={ jest.fn() }
			onToggleAll={ jest.fn() }
			entryHref={ ( id ) => `?page=quoteform-entries&entry=${ id }` }
			onOpen={ jest.fn() }
			formHref={ () => null }
			canDelete
			confirmingId={ null }
			onAskDelete={ jest.fn() }
			onConfirmDelete={ jest.fn() }
			onCancelDelete={ jest.fn() }
			deleteButtonRef={ jest.fn() }
			busy={ false }
		/>
	);
}

function selectAll() {
	return screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } );
}

describe( 'EntriesTable select-all checkbox', () => {
	it( 'is neither checked nor mixed when nothing is selected', () => {
		render( table( new Set() ) );

		expect( selectAll() ).not.toBeChecked();
		expect( selectAll().indeterminate ).toBe( false );
	} );

	it( 'is mixed when some but not all rows are selected', () => {
		render( table( new Set( [ 41 ] ) ) );

		expect( selectAll() ).not.toBeChecked();
		expect( selectAll().indeterminate ).toBe( true );
		expect( selectAll() ).toBePartiallyChecked();
	} );

	it( 'drops the mixed state once all or none are selected', () => {
		const { rerender } = render( table( new Set( [ 41, 40 ] ) ) );

		expect( selectAll().indeterminate ).toBe( true );

		rerender( table( new Set( [ 41, 40, 39 ] ) ) );

		expect( selectAll() ).toBeChecked();
		expect( selectAll().indeterminate ).toBe( false );

		rerender( table( new Set( [ 40 ] ) ) );
		expect( selectAll().indeterminate ).toBe( true );

		rerender( table( new Set() ) );
		expect( selectAll() ).not.toBeChecked();
		expect( selectAll().indeterminate ).toBe( false );
	} );
} );
