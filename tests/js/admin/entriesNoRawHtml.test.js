/**
 * Spec §2.5 / Plan 06 R15: müraciət mətni xam saxlanılır, ona görə Entries kodu
 * HEÇ VAXT HTML kimi render etmir. Bu test mənbəni oxuyur — gələcək dəyişiklik
 * `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML` yazısı və ya `insertAdjacentHTML`
 * əlavə etsə düşür. Siyahı əl ilə saxlanılmır: `entries/` və `components/` altındakı
 * HƏR fayl yoxlanır (yeni komponent avtomatik əhatə olunur).
 */
const fs = require( 'fs' );
const path = require( 'path' );

const root = path.resolve( __dirname, '../../../admin-src' );

// `innerHTML`/`outerHTML` adının İSTƏNİLƏN işlənməsi (`=`, `+=`, `[ 'innerHTML' ]`) tutulur.
const RAW_HTML = /dangerouslySetInnerHTML|\b(?:inner|outer)HTML\b|insertAdjacentHTML/;

function sources( directory ) {
	return fs.readdirSync( directory, { withFileTypes: true } ).flatMap( ( entry ) => {
		const full = path.join( directory, entry.name );

		return entry.isDirectory() ? sources( full ) : [ full ];
	} );
}

describe( 'the raw-HTML pattern', () => {
	it.each( [
		'<div dangerouslySetInnerHTML={ { __html: text } } />',
		'node.innerHTML = text;',
		'node.innerHTML += text;',
		'node.innerHTML+=text;',
		'node.outerHTML = text;',
		'node.insertAdjacentHTML( "beforeend", text );',
		'node[ "innerHTML" ] = text;',
	] )( 'catches %s', ( sample ) => {
		expect( sample ).toMatch( RAW_HTML );
	} );

	it.each( [ 'node.textContent = text;', 'const innerHtmlLabel = 1;' ] )( 'allows %s', ( sample ) => {
		expect( sample ).not.toMatch( RAW_HTML );
	} );
} );

describe( 'the entries screen never renders submitted text as HTML', () => {
	const files = [
		path.join( root, 'entries.js' ),
		// Tək canlı sahə (useAnnouncer) bu frontend modulunu import edir.
		path.resolve( root, '../frontend-src/dom/announce.js' ),
		...sources( path.join( root, 'entries' ) ),
		...sources( path.join( root, 'components' ) ),
	];

	it( 'finds the files it guards', () => {
		expect( files.length ).toBeGreaterThan( 25 );
		expect( files.map( ( file ) => path.basename( file ) ) ).toEqual(
			expect.arrayContaining( [ 'EntriesApp.js', 'EntryDetailScreen.js', '_entries.scss', 'Notice.js', 'CopyField.js' ] )
		);
	} );

	it.each( files.map( ( file ) => [ path.relative( path.resolve( root, '..' ), file ), file ] ) )( '%s', ( name, file ) => {
		const source = fs.readFileSync( file, 'utf8' );

		expect( source ).not.toMatch( RAW_HTML );
	} );
} );
