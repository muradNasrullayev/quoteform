/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import FilterBar from '../../../admin-src/entries/FilterBar';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

const forms = [ { id: 7, title: 'Cleaning quote' } ];

describe( 'FilterBar with an unrecognised "form" value (F2)', () => {
	it( 'labels a shared "deleted" link even on a site with no deleted-form entries now', () => {
		render(
			<FilterBar
				forms={ forms }
				hasDeletedForms={ false }
				filters={ { ...DEFAULT_FILTERS, form: 'deleted' } }
				onChange={ jest.fn() }
			/>
		);

		const select = screen.getByRole( 'combobox', { name: 'Form' } );

		expect( select ).toHaveValue( 'deleted' );
		expect( screen.getByRole( 'option', { name: 'Deleted forms' } ) ).toBeInTheDocument();
		expect( screen.queryByText( /Unrecognised value/ ) ).not.toBeInTheDocument();
	} );

	it( 'labels a trashed or unknown form id by its number instead of showing "Unrecognised value"', () => {
		render(
			<FilterBar
				forms={ forms }
				hasDeletedForms={ false }
				filters={ { ...DEFAULT_FILTERS, form: 999 } }
				onChange={ jest.fn() }
			/>
		);

		const select = screen.getByRole( 'combobox', { name: 'Form' } );

		expect( select ).toHaveValue( '999' );
		expect( screen.getByRole( 'option', { name: 'Form #999 (not available)' } ) ).toBeInTheDocument();
		expect( screen.queryByText( /Unrecognised value/ ) ).not.toBeInTheDocument();
	} );

	it( 'still shows a form that exists as its normal option, not "not available"', () => {
		render(
			<FilterBar
				forms={ forms }
				hasDeletedForms={ false }
				filters={ { ...DEFAULT_FILTERS, form: 7 } }
				onChange={ jest.fn() }
			/>
		);

		expect( screen.getByRole( 'option', { name: 'Cleaning quote' } ) ).toBeInTheDocument();
		expect( screen.queryByText( /not available/ ) ).not.toBeInTheDocument();
	} );
} );
