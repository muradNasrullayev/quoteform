export const LOAD_STARTED = 'load/started';
export const LOAD_SUCCEEDED = 'load/succeeded';
export const LOAD_FAILED = 'load/failed';
export const SET_TITLE = 'form/setTitle';
export const SET_SETTING = 'settings/set';
export const SAVE_STARTED = 'save/started';
export const SAVE_SUCCEEDED = 'save/succeeded';
export const SAVE_FAILED = 'save/failed';
export const DISMISS_SAVE_ERROR = 'save/dismissError';

export const loadStarted = () => ( { type: LOAD_STARTED } );
export const loadSucceeded = ( form ) => ( { type: LOAD_SUCCEEDED, form } );
export const loadFailed = ( error ) => ( { type: LOAD_FAILED, error } );

export const setTitle = ( title ) => ( { type: SET_TITLE, title } );
export const setSetting = ( key, value ) => ( { type: SET_SETTING, key, value } );

export const saveStarted = () => ( { type: SAVE_STARTED } );
export const saveSucceeded = ( form ) => ( { type: SAVE_SUCCEEDED, form } );
export const saveFailed = ( error ) => ( { type: SAVE_FAILED, error } );
export const dismissSaveError = () => ( { type: DISMISS_SAVE_ERROR } );

export const ADD_FIELD = 'fields/add';
export const UPDATE_FIELD = 'fields/update';
export const REMOVE_FIELD = 'fields/remove';
export const RENAME_FIELD = 'fields/rename';

export const addField = ( fieldType ) => ( { type: ADD_FIELD, fieldType } );
export const updateField = ( key, patch ) => ( { type: UPDATE_FIELD, key, patch } );
export const removeField = ( key ) => ( { type: REMOVE_FIELD, key } );
export const renameField = ( oldKey, newKey ) => ( { type: RENAME_FIELD, oldKey, newKey } );

export const ADD_STEP = 'steps/add';
export const UPDATE_STEP = 'steps/update';
export const REMOVE_STEP = 'steps/remove';
export const MOVE_STEP = 'steps/move';
export const ASSIGN_FIELD = 'steps/assignField';
export const UNASSIGN_FIELD = 'steps/unassignField';

export const addStep = () => ( { type: ADD_STEP } );
export const updateStep = ( index, patch ) => ( { type: UPDATE_STEP, index, patch } );
export const removeStep = ( index ) => ( { type: REMOVE_STEP, index } );
export const moveStep = ( index, direction ) => ( { type: MOVE_STEP, index, direction } );
export const assignField = ( fieldKey, stepIndex ) => ( { type: ASSIGN_FIELD, fieldKey, stepIndex } );
export const unassignField = ( fieldKey ) => ( { type: UNASSIGN_FIELD, fieldKey } );

export const ADD_CALCULATION = 'calculations/add';
export const UPDATE_CALCULATION = 'calculations/update';
export const REMOVE_CALCULATION = 'calculations/remove';
export const MOVE_CALCULATION = 'calculations/move';

export const addCalculation = () => ( { type: ADD_CALCULATION } );
export const updateCalculation = ( index, patch ) => ( { type: UPDATE_CALCULATION, index, patch } );
export const removeCalculation = ( index ) => ( { type: REMOVE_CALCULATION, index } );
export const moveCalculation = ( index, direction ) => ( { type: MOVE_CALCULATION, index, direction } );

export const ADD_RULE = 'rules/add';
export const UPDATE_RULE = 'rules/update';
export const REMOVE_RULE = 'rules/remove';
export const ADD_CONDITION = 'rules/addCondition';
export const UPDATE_CONDITION = 'rules/updateCondition';
export const REMOVE_CONDITION = 'rules/removeCondition';

export const addRule = () => ( { type: ADD_RULE } );
export const updateRule = ( index, patch ) => ( { type: UPDATE_RULE, index, patch } );
export const removeRule = ( index ) => ( { type: REMOVE_RULE, index } );
export const addCondition = ( ruleIndex ) => ( { type: ADD_CONDITION, ruleIndex } );
export const updateCondition = ( ruleIndex, conditionIndex, patch ) => ( {
	type: UPDATE_CONDITION,
	ruleIndex,
	conditionIndex,
	patch,
} );
export const removeCondition = ( ruleIndex, conditionIndex ) => ( {
	type: REMOVE_CONDITION,
	ruleIndex,
	conditionIndex,
} );
