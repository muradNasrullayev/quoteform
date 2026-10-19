/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import FilterBar, { exportHref } from '../../../admin-src/entries/FilterBar';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

const forms = [
	{ id: 7, title: 'Cleaning quote' },
	{ id: 9, title: '' },
];

function Harness( { initial = DEFAULT_FILTERS, onChange, hasDeletedForms = false } ) {
	const [ filters, setFilters ] = useState( initial );

	return (
		<>
			<FilterBar
				forms={ forms }
				hasDeletedForms={ hasDeletedForms }
				filters={ filters }
				onChange={ ( next ) => {
					onChange( next );
					setFilters( next );
				} }
			/>
			<button type="button" onClick={ () => setFilters( { ...DEFAULT_FILTERS, orderby: 'total' } ) }>
				external reset
			</button>
		</>
	);
}

beforeEach( () => {
	jest.useFakeTimers();
} );

afterEach( () => {
	jest.useRealTimers();
} );

function user() {
	return userEvent.setup( { advanceTimers: jest.advanceTimersByTime } );
}

describe( 'FilterBar', () => {
	it( 'applies a form, status or date at once', async () => {
		const onChange = jest.fn();
		const u = user();

		render( <Harness onChange={ onChange } /> );

		await u.selectOptions( screen.getByRole( 'combobox', { name: 'Form' } ), '7' );
		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, form: 7 } );

		await u.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'new' );
		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, form: 7, status: 'new' } );

		// Tarix sahəsinə hərf-hərf yazmaq jsdom-da etibarlı deyil; brauzer kimi tam dəyəri bir dəfəyə veririk.
		fireEvent.change( screen.getByLabelText( 'From' ), { target: { value: '2026-09-01' } } );
		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, form: 7, status: 'new', from: '2026-09-01' } );
	} );

	it( 'names an untitled form by its number and offers deleted forms only when they have entries', () => {
		const { unmount } = render( <Harness onChange={ jest.fn() } /> );

		expect( screen.getByRole( 'option', { name: 'Form #9' } ) ).toBeInTheDocument();
		expect( screen.queryByRole( 'option', { name: 'Deleted forms' } ) ).not.toBeInTheDocument();

		unmount();
		render( <Harness onChange={ jest.fn() } hasDeletedForms /> );

		expect( screen.getByRole( 'option', { name: 'Deleted forms' } ).value ).toBe( 'deleted' );
	} );

	it( 'waits until typing stops before filtering by total, and sends one change', async () => {
		const onChange = jest.fn();
		const u = user();

		render( <Harness onChange={ onChange } /> );

		await u.type( screen.getByLabelText( 'Minimum total' ), '150' );
		expect( onChange ).not.toHaveBeenCalled();

		act( () => {
			jest.advanceTimersByTime( 400 );
		} );

		expect( onChange ).toHaveBeenCalledTimes( 1 );
		expect( onChange ).toHaveBeenCalledWith( { ...DEFAULT_FILTERS, min: '150' } );
	} );

	it( 'keeps an unusable total in the box, flags it and does not filter by it', async () => {
		const onChange = jest.fn();
		const u = user();

		render( <Harness onChange={ onChange } initial={ { ...DEFAULT_FILTERS, max: '90' } } /> );

		const max = screen.getByLabelText( 'Maximum total' );

		await u.clear( max );
		await u.type( max, '1e3' );
		act( () => {
			jest.advanceTimersByTime( 400 );
		} );

		expect( max ).toHaveValue( '1e3' );
		expect( max ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( max ).toHaveAccessibleDescription( 'Use a plain number, like 150 or 99.50.' );
		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, max: null } );
	} );

	it( 'follows filters changed from outside', async () => {
		const u = user();

		render( <Harness onChange={ jest.fn() } initial={ { ...DEFAULT_FILTERS, min: '10', status: 'read' } } /> );

		expect( screen.getByLabelText( 'Minimum total' ) ).toHaveValue( '10' );

		await u.click( screen.getByRole( 'button', { name: 'external reset' } ) );

		expect( screen.getByLabelText( 'Minimum total' ) ).toHaveValue( '' );
		expect( screen.getByRole( 'combobox', { name: 'Status' } ) ).toHaveValue( '' );
	} );

	it( 'clears filters but keeps the sort order', async () => {
		const onChange = jest.fn();
		const u = user();

		render( <Harness onChange={ onChange } initial={ { ...DEFAULT_FILTERS, status: 'new', orderby: 'total', order: 'asc' } } /> );

		await u.click( screen.getByRole( 'button', { name: 'Clear filters' } ) );

		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, orderby: 'total', order: 'asc' } );
		expect( screen.queryByRole( 'button', { name: 'Clear filters' } ) ).not.toBeInTheDocument();
	} );
} );

describe( 'exportHref', () => {
	const base = 'http://example.test/wp-admin/admin-post.php?action=qform_export_entries&_wpnonce=abc123';

	it( 'adds the current filters to the signed export link', () => {
		const href = exportHref( base, { ...DEFAULT_FILTERS, form: 7, status: 'new', orderby: 'total' } );
		const url = new URL( href );

		expect( url.searchParams.get( '_wpnonce' ) ).toBe( 'abc123' );
		expect( url.searchParams.get( 'action' ) ).toBe( 'qform_export_entries' );
		expect( url.searchParams.get( 'form' ) ).toBe( '7' );
		expect( url.searchParams.get( 'status' ) ).toBe( 'new' );
		expect( url.searchParams.get( 'orderby' ) ).toBe( 'total' );
		expect( href ).not.toContain( '&amp;' );
	} );

	it( 'leaves the link as it is with no filters', () => {
		expect( exportHref( base, DEFAULT_FILTERS ) ).toBe( base );
	} );
} );
