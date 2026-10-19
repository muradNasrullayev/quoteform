/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SectionNav, { describeTab } from '../../../admin-src/components/SectionNav';

const tabs = [
	{ name: 'fields', label: 'Fields', count: 11, hasProblem: true },
	{ name: 'steps', label: 'Steps', count: 1, hasProblem: false },
	{ name: 'calculations', label: 'Pricing', count: 0, hasProblem: false },
	{ name: 'settings', label: 'Settings', count: null, hasProblem: false },
];

describe( 'describeTab', () => {
	it( 'counts items with the right plural', () => {
		expect( describeTab( { count: 11, hasProblem: false } ) ).toBe( '11 items' );
		expect( describeTab( { count: 1, hasProblem: false } ) ).toBe( '1 item' );
		expect( describeTab( { count: 0, hasProblem: false } ) ).toBe( '0 items' );
	} );

	it( 'adds the problem after the count', () => {
		expect( describeTab( { count: 11, hasProblem: true } ) ).toBe( '11 items, has a problem' );
	} );

	it( 'describes a problem on a tab without a count', () => {
		expect( describeTab( { count: null, hasProblem: true } ) ).toBe( 'Has a problem' );
	} );

	it( 'says nothing when there is nothing to say', () => {
		expect( describeTab( { count: null, hasProblem: false } ) ).toBe( '' );
	} );
} );

describe( 'SectionNav', () => {
	const renderNav = ( current = 'fields', onSelect = jest.fn() ) =>
		render( <SectionNav label="Builder sections" tabs={ tabs } current={ current } onSelect={ onSelect } /> );

	it( 'names each tab by its label alone, so the count never leaks into the name', () => {
		renderNav();

		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Pricing' } ) ).toBeInTheDocument();
	} );

	it( 'describes the count and the problem', () => {
		renderNav();

		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).toHaveAccessibleDescription( '11 items, has a problem' );
		expect( screen.getByRole( 'button', { name: 'Steps' } ) ).toHaveAccessibleDescription( '1 item' );
	} );

	it( 'has no description for a tab with nothing to describe', () => {
		renderNav();

		expect( screen.getByRole( 'button', { name: 'Settings' } ) ).not.toHaveAttribute( 'aria-describedby' );
	} );

	it( 'marks only the current tab', () => {
		renderNav( 'steps' );

		expect( screen.getByRole( 'button', { name: 'Steps' } ) ).toHaveAttribute( 'aria-current', 'page' );
		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).not.toHaveAttribute( 'aria-current' );
	} );

	it( 'reports the chosen tab', async () => {
		const onSelect = jest.fn();

		renderNav( 'fields', onSelect );
		await userEvent.click( screen.getByRole( 'button', { name: 'Pricing' } ) );

		expect( onSelect ).toHaveBeenCalledWith( 'calculations' );
	} );

	it( 'lives in a labelled navigation landmark', () => {
		renderNav();

		expect( screen.getByRole( 'navigation', { name: 'Builder sections' } ) ).toBeInTheDocument();
	} );
} );
