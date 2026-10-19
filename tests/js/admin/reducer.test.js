import { reducer, initialState } from '../../../admin-src/state/reducer';
import {
	addCalculation,
	addField,
	addRule,
	addStep,
	assignField,
	dismissSaveError,
	loadFailed,
	loadStarted,
	loadSucceeded,
	moveCalculation,
	moveStep,
	removeCalculation,
	removeCondition,
	removeField,
	removeRule,
	removeStep,
	saveFailed,
	saveStarted,
	saveSucceeded,
	setSetting,
	setTitle,
	updateCalculation,
	updateField,
	updateRule,
	updateStep,
} from '../../../admin-src/state/actions';

const form = {
	id: 7,
	title: 'Cleaning quote',
	schema: {
		version: 1,
		settings: { currency: 'USD', decimals: 2 },
		fields: {},
		steps: [],
		calculations: [],
		rules: [],
		notifications: [],
	},
};

describe( 'loading', () => {
	it( 'starts clean and empty', () => {
		expect( initialState.id ).toBeNull();
		expect( initialState.schema ).toBeNull();
		expect( initialState.dirty ).toBe( false );
	} );

	it( 'stores the loaded form and is not dirty', () => {
		const state = reducer( initialState, loadSucceeded( form ) );

		expect( state.id ).toBe( 7 );
		expect( state.title ).toBe( 'Cleaning quote' );
		expect( state.schema.settings.currency ).toBe( 'USD' );
		expect( state.dirty ).toBe( false );
		expect( state.loadError ).toBeNull();
	} );

	it( 'clears a previous load error when a load starts', () => {
		const failed = reducer( initialState, loadFailed( { code: 'qform_form_not_found' } ) );
		const restarted = reducer( failed, loadStarted() );

		expect( failed.loadError.code ).toBe( 'qform_form_not_found' );
		expect( restarted.loadError ).toBeNull();
	} );

	it( 'clears the previously loaded document when a new load starts, so it can never be shown or saved as the next form', () => {
		const editedFirst = reducer(
			{
				...reducer( initialState, loadSucceeded( form ) ),
				saveError: { code: 'qform_invalid_schema', errors: [] },
			},
			setTitle( 'Renamed' )
		);

		const restarted = reducer( editedFirst, loadStarted() );

		expect( restarted.id ).toBeNull();
		expect( restarted.title ).toBe( '' );
		expect( restarted.schema ).toBeNull();
		expect( restarted.dirty ).toBe( false );
		expect( restarted.saveError ).toBeNull();
	} );

	it( 'is not dirty after a load fails', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const edited = reducer( loaded, setTitle( 'Renamed' ) );
		const failed = reducer( edited, loadFailed( { code: 'qform_form_not_found' } ) );

		expect( failed.dirty ).toBe( false );
	} );

	it( 'clears a stale saving flag and save error when a load succeeds', () => {
		const stale = {
			...initialState,
			saving: true,
			saveError: { code: 'qform_invalid_schema', errors: [] },
		};

		const state = reducer( stale, loadSucceeded( form ) );

		expect( state.saving ).toBe( false );
		expect( state.saveError ).toBeNull();
	} );
} );

describe( 'editing', () => {
	it( 'sets the title and becomes dirty', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const state = reducer( loaded, setTitle( 'Renamed' ) );

		expect( state.title ).toBe( 'Renamed' );
		expect( state.dirty ).toBe( true );
	} );

	it( 'sets one setting without disturbing the others', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const state = reducer( loaded, setSetting( 'decimals', 4 ) );

		expect( state.schema.settings.decimals ).toBe( 4 );
		expect( state.schema.settings.currency ).toBe( 'USD' );
		expect( state.dirty ).toBe( true );
	} );

	it( 'never mutates the state it was given', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const before = JSON.stringify( loaded );

		reducer( loaded, setSetting( 'decimals', 6 ) );

		expect( JSON.stringify( loaded ) ).toBe( before );
	} );

	it( 'ignores edits when nothing is loaded', () => {
		const state = reducer( initialState, setSetting( 'decimals', 4 ) );

		expect( state ).toBe( initialState );
	} );

	it( 'ignores a title change when nothing is loaded', () => {
		const state = reducer( initialState, setTitle( 'Renamed' ) );

		expect( state ).toBe( initialState );
	} );

	it( 'does not become dirty when a setting is set to its current value', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const state = reducer( loaded, setSetting( 'currency', 'USD' ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when a field patch targets a key that does not exist', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const state = reducer( loaded, updateField( 'ghost', { label: 'x' } ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when removing a field key that does not exist', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const state = reducer( loaded, removeField( 'ghost' ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when adding a field of an unknown type', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const state = reducer( loaded, addField( 'bogus' ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );
} );

describe( 'editing steps', () => {
	const formWithStep = {
		...form,
		schema: {
			...form.schema,
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'a' ] } ],
		},
	};

	it( 'does not become dirty when removeStep targets an index that does not exist', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithStep ) );
		const state = reducer( loaded, removeStep( 9 ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when updateStep targets an index that does not exist', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithStep ) );
		const state = reducer( loaded, updateStep( 9, { title: 'x' } ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when assignField targets a step index that does not exist', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithStep ) );
		const state = reducer( loaded, assignField( 'a', 9 ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when a step cannot move any further in the requested direction', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithStep ) );
		const state = reducer( loaded, moveStep( 0, 'up' ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'becomes dirty and returns a new state when a step is added', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithStep ) );
		const state = reducer( loaded, addStep() );

		expect( state.dirty ).toBe( true );
		expect( state ).not.toBe( loaded );
		expect( state.schema ).not.toBe( loaded.schema );
	} );
} );

describe( 'editing calculations', () => {
	const formWithCalculation = {
		...form,
		schema: {
			...form.schema,
			calculations: [ { key: 'total', expression: '1', label: 'Total', visible: true } ],
		},
	};

	it( 'does not become dirty when updateCalculation targets an index that does not exist', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithCalculation ) );
		const state = reducer( loaded, updateCalculation( 9, { label: 'x' } ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when removeCalculation targets an index that does not exist', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithCalculation ) );
		const state = reducer( loaded, removeCalculation( 9 ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when a calculation cannot move any further in the requested direction', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithCalculation ) );
		const state = reducer( loaded, moveCalculation( 0, 'up' ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'becomes dirty and returns a new state when a calculation is added', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithCalculation ) );
		const state = reducer( loaded, addCalculation() );

		expect( state.dirty ).toBe( true );
		expect( state ).not.toBe( loaded );
		expect( state.schema ).not.toBe( loaded.schema );
	} );
} );

describe( 'editing rules', () => {
	const formWithRule = {
		...form,
		schema: {
			...form.schema,
			rules: [
				{
					target: { kind: 'field', key: 'note' },
					action: 'show',
					match: 'all',
					conditions: [ { field: 'urgency', operator: 'equals', value: 'express' } ],
				},
			],
		},
	};

	it( 'does not become dirty when updateRule targets an index that does not exist', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithRule ) );
		const state = reducer( loaded, updateRule( 9, { action: 'hide' } ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when removeRule targets an index that does not exist', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithRule ) );
		const state = reducer( loaded, removeRule( 9 ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'does not become dirty when removeCondition refuses to remove the last condition', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithRule ) );
		const state = reducer( loaded, removeCondition( 0, 0 ) );

		expect( state.dirty ).toBe( false );
		expect( state ).toBe( loaded );
	} );

	it( 'becomes dirty and returns a new state when a rule is added', () => {
		const loaded = reducer( initialState, loadSucceeded( formWithRule ) );
		const state = reducer( loaded, addRule() );

		expect( state.dirty ).toBe( true );
		expect( state ).not.toBe( loaded );
		expect( state.schema ).not.toBe( loaded.schema );
	} );
} );

describe( 'saving', () => {
	it( 'marks saving and clears the previous save error', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const failed = reducer( loaded, saveFailed( { code: 'qform_invalid_schema', errors: [] } ) );
		const state = reducer( failed, saveStarted() );

		expect( failed.saveError.code ).toBe( 'qform_invalid_schema' );
		expect( state.saving ).toBe( true );
		expect( state.saveError ).toBeNull();
	} );

	it( 'is clean again after a successful save, and takes the server copy', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const edited = reducer( loaded, setTitle( 'Renamed' ) );
		const saved = reducer( edited, saveSucceeded( { ...form, title: 'Renamed' } ) );

		expect( saved.dirty ).toBe( false );
		expect( saved.saving ).toBe( false );
		expect( saved.title ).toBe( 'Renamed' );
	} );

	it( 'stays dirty when the save fails', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const edited = reducer( loaded, setTitle( 'Renamed' ) );
		const failed = reducer( edited, saveFailed( { code: 'qform_invalid_schema', errors: [] } ) );

		expect( failed.dirty ).toBe( true );
		expect( failed.saving ).toBe( false );
		expect( failed.saveError.code ).toBe( 'qform_invalid_schema' );
	} );

	it( 'dismisses the save error without touching the document', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const failed = reducer( loaded, saveFailed( { code: 'qform_invalid_schema', errors: [] } ) );
		const state = reducer( failed, dismissSaveError() );

		expect( state.saveError ).toBeNull();
		expect( state.schema ).toEqual( failed.schema );
	} );
} );

describe( 'unknown actions', () => {
	it( 'returns the same state object', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );

		expect( reducer( loaded, { type: 'nothing/at/all' } ) ).toBe( loaded );
	} );
} );
