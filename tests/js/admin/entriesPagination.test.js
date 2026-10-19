/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Pagination, { pageWindow } from '../../../admin-src/entries/Pagination';

describe( 'pageWindow', () => {
	it( 'lists every page when there are few', () => {
		expect( pageWindow( 1, 5 ) ).toEqual( [ 1, 2, 3, 4, 5 ] );
	} );

	it( 'keeps the first, the last and two either side of the current page', () => {
		expect( pageWindow( 50, 250 ) ).toEqual( [ 1, 'gap', 48, 49, 50, 51, 52, 'gap', 250 ] );
	} );

	it( 'shows a single skipped number instead of a gap', () => {
		expect( pageWindow( 5, 9 ) ).toEqual( [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ] );
		expect( pageWindow( 1, 9 ) ).toEqual( [ 1, 2, 3, 'gap', 9 ] );
	} );

	it( 'is empty when there are no pages', () => {
		expect( pageWindow( 1, 0 ) ).toEqual( [] );
	} );
} );

describe( 'Pagination', () => {
	it( 'moves between pages and marks the current one', async () => {
		const onPage = jest.fn();
		const user = userEvent.setup();

		render( <Pagination page={ 2 } pages={ 3 } perPage={ 20 } onPage={ onPage } onPerPage={ jest.fn() } /> );

		expect( screen.getByRole( 'navigation', { name: 'Entry list pages' } ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Page 2 of 3' } ) ).toHaveAttribute( 'aria-current', 'page' );

		await user.click( screen.getByRole( 'button', { name: 'Page 3 of 3' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Previous page' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Next page' } ) );

		expect( onPage.mock.calls ).toEqual( [ [ 3 ], [ 1 ], [ 3 ] ] );
	} );

	it( 'disables the arrows at the ends', () => {
		render( <Pagination page={ 1 } pages={ 2 } perPage={ 20 } onPage={ jest.fn() } onPerPage={ jest.fn() } /> );

		expect( screen.getByRole( 'button', { name: 'Previous page' } ) ).toBeDisabled();
		expect( screen.getByRole( 'button', { name: 'Next page' } ) ).toBeEnabled();
	} );

	it( 'hides the page buttons on a single page but keeps the page size choice', async () => {
		const onPerPage = jest.fn();
		const user = userEvent.setup();

		render( <Pagination page={ 1 } pages={ 1 } perPage={ 20 } onPage={ jest.fn() } onPerPage={ onPerPage } /> );

		expect( screen.queryByRole( 'navigation' ) ).not.toBeInTheDocument();

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Per page' } ), '50' );

		expect( onPerPage ).toHaveBeenCalledWith( 50 );
	} );

	it( 'keeps an unusual stored page size selectable', () => {
		render( <Pagination page={ 1 } pages={ 1 } perPage={ 37 } onPage={ jest.fn() } onPerPage={ jest.fn() } /> );

		expect( screen.getByRole( 'combobox', { name: 'Per page' } ) ).toHaveValue( '37' );
	} );
} );
