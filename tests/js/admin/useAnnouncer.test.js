/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import { useRef } from 'react';

import useAnnouncer from '../../../admin-src/entries/useAnnouncer';

let announce = null;

function Probe() {
	const ref = useRef( null );

	announce = useAnnouncer( ref );

	return <div data-testid="live" ref={ ref } />;
}

beforeEach( () => {
	jest.useFakeTimers();
} );

afterEach( () => {
	jest.useRealTimers();
} );

describe( 'useAnnouncer', () => {
	it( 'puts exactly one polite region in its container and speaks through it', () => {
		const { getByTestId } = render( <Probe /> );
		const regions = getByTestId( 'live' ).querySelectorAll( '[aria-live]' );

		expect( regions ).toHaveLength( 1 );
		expect( regions[ 0 ] ).toHaveAttribute( 'role', 'status' );

		act( () => {
			announce( '3 entries deleted.' );
			jest.advanceTimersByTime( 600 );
		} );

		expect( regions[ 0 ] ).toHaveTextContent( '3 entries deleted.' );
	} );

	it( 'repeats an identical message when forced', () => {
		const { getByTestId } = render( <Probe /> );
		const region = getByTestId( 'live' ).querySelector( '[aria-live]' );

		act( () => {
			announce( 'Something went wrong.' );
			jest.advanceTimersByTime( 600 );
		} );
		act( () => {
			announce( 'Something went wrong.', { force: true } );
		} );

		expect( region.textContent ).toBe( '' );

		act( () => {
			jest.advanceTimersByTime( 600 );
		} );

		expect( region ).toHaveTextContent( 'Something went wrong.' );
	} );

	it( 'removes its region when the screen goes away', () => {
		const { getByTestId, unmount } = render( <Probe /> );
		const container = getByTestId( 'live' );

		unmount();

		expect( container.querySelector( '[aria-live]' ) ).toBeNull();
		expect( () => announce( 'late' ) ).not.toThrow();
	} );
} );
