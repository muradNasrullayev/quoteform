/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { deleteEntry, listEntries } from '../../../admin-src/api/client';
import EntriesListScreen from '../../../admin-src/entries/EntriesListScreen';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listEntries: jest.fn(),
	getEntry: jest.fn(),
	updateEntries: jest.fn(),
	deleteEntry: jest.fn(),
} ) );

const config = {
	perPage: 20,
	canDelete: true,
	canManageForms: true,
	canExport: true,
	exportUrl: 'http://example.test/wp-admin/admin-post.php?action=qform_export_entries&_wpnonce=abc',
	builderUrl: 'http://example.test/wp-admin/admin.php?page=quoteform',
	forms: [ { id: 7, title: 'Cleaning quote' } ],
	hasDeletedForms: false,
};

function item( id ) {
	return {
		id,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: false,
		name: `Person ${ id }`,
		email: `p${ id }@example.com`,
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25, 2026', full: '2026-09-25 01:30:00', iso: '2026-09-24T21:30:00Z' },
	};
}

function result( items ) {
	return { items, total: items.length, pages: 1, page: 1, per_page: 20, unread: 2 };
}

function Harness() {
	const [ state, setState ] = useState( { filters: DEFAULT_FILTERS, paged: 1 } );

	return (
		<EntriesListScreen
			config={ config }
			filters={ state.filters }
			paged={ state.paged }
			onChange={ ( patch ) => setState( ( current ) => ( { ...current, ...patch } ) ) }
			onOpen={ jest.fn() }
			announce={ jest.fn() }
			onUnread={ jest.fn() }
		/>
	);
}

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise( ( done, fail ) => {
		resolve = done;
		reject = fail;
	} );

	return { promise, resolve, reject };
}

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'a pending single-row delete (F1)', () => {
	it( 'moves focus to the row Delete button and keeps it focusable (aria-disabled, not disabled)', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		const pending = deferred();

		deleteEntry.mockReturnValue( pending.promise );
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'button', { name: 'Delete entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		const button = screen.getByRole( 'button', { name: 'Delete entry #41' } );

		expect( document.activeElement ).toBe( button );
		expect( button ).toHaveAttribute( 'aria-disabled', 'true' );
		expect( button ).not.toBeDisabled();
	} );
} );
