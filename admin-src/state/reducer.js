import {
	ADD_CALCULATION,
	ADD_CONDITION,
	ADD_FIELD,
	ADD_RULE,
	ADD_STEP,
	ASSIGN_FIELD,
	DISMISS_SAVE_ERROR,
	LOAD_FAILED,
	LOAD_STARTED,
	LOAD_SUCCEEDED,
	MOVE_CALCULATION,
	MOVE_STEP,
	REMOVE_CALCULATION,
	REMOVE_CONDITION,
	REMOVE_FIELD,
	REMOVE_RULE,
	REMOVE_STEP,
	RENAME_FIELD,
	SAVE_FAILED,
	SAVE_STARTED,
	SAVE_SUCCEEDED,
	SET_SETTING,
	SET_TITLE,
	UNASSIGN_FIELD,
	UPDATE_CALCULATION,
	UPDATE_CONDITION,
	UPDATE_FIELD,
	UPDATE_RULE,
	UPDATE_STEP,
} from './actions';
import { calculationsReducer } from './calculations';
import { fieldsReducer } from './fields';
import { rulesReducer } from './rules';
import { stepsReducer } from './steps';

export const initialState = {
	id: null,
	title: '',
	schema: null,
	dirty: false,
	saving: false,
	loadError: null,
	saveError: null,
};

/**
 * Sxemi dəyişən HƏR əməliyyat buradan keçir, ona görə `dirty: true`
 * bir yerdə yazılır və hər slice-ın onu ayrıca yadda saxlaması lazım gəlmir.
 */
function editSchema( state, produce ) {
	if ( state.schema === null ) {
		return state;
	}

	const next = produce( state.schema );

	if ( next === state.schema ) {
		return state;
	}

	return {
		...state,
		schema: next,
		dirty: true,
	};
}

export function reducer( state, action ) {
	switch ( action.type ) {
		case LOAD_STARTED:
			return {
				...state,
				id: null,
				title: '',
				schema: null,
				dirty: false,
				loadError: null,
				saveError: null,
			};

		case LOAD_SUCCEEDED:
			return {
				...state,
				id: action.form.id,
				title: action.form.title,
				schema: action.form.schema,
				dirty: false,
				saving: false,
				loadError: null,
				saveError: null,
			};

		case LOAD_FAILED:
			return { ...state, schema: null, dirty: false, loadError: action.error };

		case SET_TITLE:
			if ( state.schema === null ) {
				return state;
			}

			return { ...state, title: action.title, dirty: true };

		case SET_SETTING:
			return editSchema( state, ( schema ) => {
				if ( schema.settings[ action.key ] === action.value ) {
					return schema;
				}

				return {
					...schema,
					settings: { ...schema.settings, [ action.key ]: action.value },
				};
			} );

		case SAVE_STARTED:
			return { ...state, saving: true, saveError: null };

		case SAVE_SUCCEEDED:
			return {
				...state,
				id: action.form.id,
				title: action.form.title,
				schema: action.form.schema,
				dirty: false,
				saving: false,
				saveError: null,
			};

		case SAVE_FAILED:
			return { ...state, saving: false, saveError: action.error };

		case DISMISS_SAVE_ERROR:
			return { ...state, saveError: null };

		case ADD_FIELD:
		case UPDATE_FIELD:
		case REMOVE_FIELD:
		case RENAME_FIELD:
			return editSchema( state, ( schema ) => {
				const fields = fieldsReducer( schema.fields, action );

				if ( fields === schema.fields ) {
					return schema;
				}

				return { ...schema, fields };
			} );

		case ADD_STEP:
		case UPDATE_STEP:
		case REMOVE_STEP:
		case MOVE_STEP:
		case ASSIGN_FIELD:
		case UNASSIGN_FIELD:
			return editSchema( state, ( schema ) => {
				const steps = stepsReducer( schema.steps, action );

				if ( steps === schema.steps ) {
					return schema;
				}

				return { ...schema, steps };
			} );

		case ADD_CALCULATION:
		case UPDATE_CALCULATION:
		case REMOVE_CALCULATION:
		case MOVE_CALCULATION:
			return editSchema( state, ( schema ) => {
				const calculations = calculationsReducer( schema.calculations, action );

				return calculations === schema.calculations ? schema : { ...schema, calculations };
			} );

		case ADD_RULE:
		case UPDATE_RULE:
		case REMOVE_RULE:
		case ADD_CONDITION:
		case UPDATE_CONDITION:
		case REMOVE_CONDITION:
			return editSchema( state, ( schema ) => {
				const rules = rulesReducer( schema.rules, action );

				return rules === schema.rules ? schema : { ...schema, rules };
			} );

		default:
			return state;
	}
}
