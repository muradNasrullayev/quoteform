import { createContext, useContext, useReducer } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { initialState, reducer } from './reducer';

const StateContext = createContext( null );
const DispatchContext = createContext( null );

export function StoreProvider( { children } ) {
	const [ state, dispatch ] = useReducer( reducer, initialState );

	return (
		<DispatchContext.Provider value={ dispatch }>
			<StateContext.Provider value={ state }>{ children }</StateContext.Provider>
		</DispatchContext.Provider>
	);
}

export function useStore() {
	const state = useContext( StateContext );

	if ( state === null ) {
		throw new Error(
			__( 'useStore must be used inside a StoreProvider.', 'quoteform' )
		);
	}

	return state;
}

export function useDispatch() {
	const dispatch = useContext( DispatchContext );

	if ( dispatch === null ) {
		throw new Error(
			__( 'useDispatch must be used inside a StoreProvider.', 'quoteform' )
		);
	}

	return dispatch;
}
