/**
 * Spec §7.2-nin ikinci səbəbi: AST üzərində İNSANİ xəta mesajı vermək
 * (`{bathroms}` adlı sahə yoxdur — `{bathrooms}` nəzərdə tutmusunuz?).
 *
 * Təklif YALNIZ builder-də verilir: ziyarətçi düstur xətasını heç vaxt
 * görmür, ona görə bu kod ölçü büdcəsi olan frontend bundle-ına
 * qoyulmur (spec §18) və mühərriklərin İÇİNDƏ də təkrarlanmır — orada iki
 * dilə paralel Levenshtein saxlamaq məhz bu layihədə artıq bir dəfə ölü
 * koda çevrilmişdi.
 */

/**
 * Səhv təklif heç bir təklifdən pisdir, ona görə hədd ölçülüdür:
 *
 * - məsafə 1 — bir hərf səhvi (buraxılmış, artıq, yanlış hərf);
 * - məsafə 2 — yerdəyişmə (`bahtrooms`) və ya ikiqat səhv;
 * - 4 hərfə qədər adlarda yalnız 1, çünki qısa adlarda 2 məsafə bir açarı
 *   TAMAM BAŞQA açara çevirir (`size` → `site` → `date`).
 *
 * Bundan başqa, ən yaxın namizəd TƏK olmalıdır: eyni məsafədə iki açar
 * varsa, hansının nəzərdə tutulduğu bilinmir və heç nə təklif edilmir.
 */
const MAX_DISTANCE = 2;
const SHORT_NAME_LENGTH = 4;

function distance( a, b ) {
	if ( a === b ) {
		return 0;
	}

	const rows = Array.from( a );
	const columns = Array.from( b );

	if ( rows.length === 0 ) {
		return columns.length;
	}

	if ( columns.length === 0 ) {
		return rows.length;
	}

	let previous = [ 0 ].concat( columns.map( ( _, index ) => index + 1 ) );

	for ( let i = 0; i < rows.length; i++ ) {
		const current = [ i + 1 ];

		for ( let j = 0; j < columns.length; j++ ) {
			const substitution = previous[ j ] + ( rows[ i ] === columns[ j ] ? 0 : 1 );
			const insertion = current[ j ] + 1;
			const deletion = previous[ j + 1 ] + 1;

			current.push( Math.min( substitution, insertion, deletion ) );
		}

		previous = current;
	}

	return previous[ columns.length ];
}

export function suggestName( name, candidates ) {
	const text = String( name );

	if ( text === '' || ! Array.isArray( candidates ) ) {
		return null;
	}

	const limit = Math.min(
		MAX_DISTANCE,
		Array.from( text ).length <= SHORT_NAME_LENGTH ? 1 : MAX_DISTANCE
	);

	let best = null;
	let bestDistance = limit + 1;
	let ties = 0;

	candidates.forEach( ( candidate ) => {
		const other = String( candidate );

		if ( other === text ) {
			return;
		}

		const gap = distance( text, other );

		if ( gap > limit ) {
			return;
		}

		if ( gap < bestDistance ) {
			best = other;
			bestDistance = gap;
			ties = 1;
		} else if ( gap === bestDistance ) {
			ties++;
		}
	} );

	return ties === 1 ? best : null;
}
