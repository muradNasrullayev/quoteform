import { calculate } from './calculate';
import { visibleSteps } from './steps';
import { validateVisible } from './validate';
import { variablesFor } from './values';
import { resolveVisibility } from './visibility';

/**
 * Göndərilən formanın tam qiymətləndirilməsi — serverin (includes/Runtime/
 * Evaluation.php) etdiyinin EYNİSİ. Paritet qapısı (tests/fixtures/
 * submissions.json) bu iki funksiyanı müqayisə edir; açar adları ona görə
 * snake_case-dir və PHP massivinin açarları ilə üst-üstə düşür.
 */
export function evaluateSubmission( schema, state ) {
	const visibility = resolveVisibility( schema, state );
	const variables = variablesFor( schema, state, visibility.fields );
	const result = calculate( schema, variables );

	return {
		visible_fields: [ ...visibility.fields ].sort(),
		visible_steps: visibleSteps( schema, visibility ).map( ( step ) => step.key ),
		required: [ ...visibility.required ].sort(),
		errors: validateVisible( schema, state, visibility ),
		total: result.total,
		breakdown: result.breakdown.map( ( row ) => ( { key: row.key, label: row.label, amount: row.amount } ) ),
		calc_error: result.error,
	};
}
