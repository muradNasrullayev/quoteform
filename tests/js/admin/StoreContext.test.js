/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded, setTitle } from '../../../admin-src/state/actions';

const form = {
	id: 3,
	title: 'Before',
	schema: { version: 1, settings: {}, fields: {}, steps: [], calculations: [], rules: [], notifications: [] },
};

function Probe() {
	const { title, dirty } = useStore();
	const dispatch = useDispatch();

	return (
		<div>
			<p>title: { title }</p>
			<p>dirty: { dirty ? 'yes' : 'no' }</p>
			<button onClick={ () => dispatch( loadSucceeded( form ) ) }>load</button>
			<button onClick={ () => dispatch( setTitle( 'After' ) ) }>rename</button>
		</div>
	);
}

function DispatchOnly( { onRender } ) {
	const dispatch = useDispatch();

	onRender();

	return (
		<div>
			<button onClick={ () => dispatch( loadSucceeded( form ) ) }>do-load</button>
			<button onClick={ () => dispatch( setTitle( 'Changed' ) ) }>do-rename</button>
		</div>
	);
}

function StateConsumer( { onRender } ) {
	const store = useStore();

	onRender();

	return <p>state-title: { store.title }</p>;
}

function DispatchOnlyOutside() {
	useDispatch();

	return null;
}

describe( 'StoreContext', () => {
	it( 'threads state and dispatch through the tree', async () => {
		const user = userEvent.setup();

		render(
			<StoreProvider>
				<Probe />
			</StoreProvider>
		);

		await user.click( screen.getByRole( 'button', { name: 'load' } ) );
		expect( screen.getByText( 'title: Before' ) ).toBeInTheDocument();
		expect( screen.getByText( 'dirty: no' ) ).toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'rename' } ) );
		expect( screen.getByText( 'title: After' ) ).toBeInTheDocument();
		expect( screen.getByText( 'dirty: yes' ) ).toBeInTheDocument();
	} );

	it( 'throws a useful error when a hook is used outside the provider', () => {
		const spy = jest.spyOn( console, 'error' ).mockImplementation( () => {} );

		expect( () => render( <Probe /> ) ).toThrow( /StoreProvider/ );

		spy.mockRestore();
	} );

	it( 'throws a useful error when useDispatch is used outside the provider', () => {
		const spy = jest.spyOn( console, 'error' ).mockImplementation( () => {} );

		expect( () => render( <DispatchOnlyOutside /> ) ).toThrow( /StoreProvider/ );

		spy.mockRestore();
	} );

	it( 'does not re-render a dispatch-only consumer when the document changes', async () => {
		const user = userEvent.setup();
		const dispatchRenders = jest.fn();
		const stateRenders = jest.fn();

		render(
			<StoreProvider>
				<DispatchOnly onRender={ dispatchRenders } />
				<StateConsumer onRender={ stateRenders } />
			</StoreProvider>
		);

		expect( dispatchRenders ).toHaveBeenCalledTimes( 1 );
		expect( stateRenders ).toHaveBeenCalledTimes( 1 );

		await user.click( screen.getByRole( 'button', { name: 'do-load' } ) );
		await user.click( screen.getByRole( 'button', { name: 'do-rename' } ) );

		expect( dispatchRenders ).toHaveBeenCalledTimes( 1 );
		expect( stateRenders ).toHaveBeenCalledTimes( 3 );
	} );
} );
