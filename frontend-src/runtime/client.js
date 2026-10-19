const SESSION_TTL_MS = 60 * 60 * 1000;
const TICKET_REUSE_MS = 23 * 60 * 60 * 1000;
const MIN_TICKET_AGE_MS = 3500;

/**
 * REST ünvanı plain permalink-də `…/index.php?rest_route=/quoteform/v1/`
 * formasındadır — sorğu parametri `?` yox, `&` ilə qoşulmalıdır.
 */
export function endpoint( restUrl, path, query = {} ) {
	const base = `${ restUrl }${ path }`;
	const pairs = Object.keys( query ).map(
		( key ) => `${ encodeURIComponent( key ) }=${ encodeURIComponent( query[ key ] ) }`
	);

	if ( pairs.length === 0 ) {
		return base;
	}

	return `${ base }${ base.indexOf( '?' ) === -1 ? '?' : '&' }${ pairs.join( '&' ) }`;
}

async function readJson( response ) {
	try {
		return await response.json();
	} catch ( error ) {
		return null;
	}
}

// Gözləmə həmişə [0, MIN_TICKET_AGE_MS] aralığına sıxılır. Saat geri düşübsə
// (`age` mənfi ola bilər), bu, `wait()`-ə saatlarla gözləmə tapşırmağın
// qarşısını alır — ziyarətçi sonsuza qədər "göndərilir..." görməməlidir.
function clampWait( age ) {
	return Math.min( Math.max( MIN_TICKET_AGE_MS - age, 0 ), MIN_TICKET_AGE_MS );
}

/**
 * Göndərmə üçün şəbəkə qatı. Ticket yenilənmədə SAXLANILIR: server onu
 * "3 saniyədən təzə" olanda spam sayır, yəni yeni ticket (məsələn, köhnəlmiş
 * nonce yenilənəndə) ziyarətçinin göndərişini səssizcə itirərdi.
 *
 * R10: heç bir sorğuda `X-WP-Nonce` başlığı göndərilmir — nonce yalnız JSON
 * body-də gedir. Bu başlıq WordPress-i sorğunu login olmuş istifadəçiyə
 * keçirməyə vadar edərdi, `qform_submit` nonce-u isə istifadəçi 0 üçün
 * verilib — uyğunsuzluq hər login olmuş göndərişi `qform_expired`-lə pozardı.
 */
export function createClient( {
	restUrl,
	formId,
	fetchImpl = ( ...args ) => window.fetch( ...args ),
	now = () => Date.now(),
	wait = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) ),
} ) {
	let session = null;
	let pending = null;

	// İkinci çağırış birincinin cavabını GÖZLƏYİR, ikinci `/session` sorğusu
	// göndərmir — paralel `ensureSession()` çağırışları (məsələn, forma
	// açılanda eyni anda bir neçə nəzarətçi işə düşəndə) tək şəbəkə
	// sorğusuna düşür. `finally` uğur/rədd fərq etmədən `pending`-i təmizləyir
	// ki, sonrakı çağırış (retry daxil) TƏZƏ sorğu göndərə bilsin.
	function refreshSession() {
		if ( pending !== null ) {
			return pending;
		}

		pending = ( async () => {
			try {
				const response = await fetchImpl( endpoint( restUrl, 'session', { form_id: formId } ), {
					credentials: 'same-origin',
					cache: 'no-store',
				} );
				const body = await readJson( response );

				if ( ! response.ok || ! body || typeof body.nonce !== 'string' || typeof body.ticket !== 'string' ) {
					throw new Error( 'quoteform: no session' );
				}

				// Saat geri düşübsə, köhnə ticket-in yaşı mənfi çıxar — bu halda
				// etibarsız sayılır, əks halda 23 saatlıq pəncərə mənasızlaşardı.
				const ticketAge = session !== null ? now() - session.ticketAt : null;
				const keepTicket = ticketAge !== null && ticketAge >= 0 && ticketAge < TICKET_REUSE_MS;

				session = {
					nonce: body.nonce,
					fetchedAt: now(),
					ticket: keepTicket ? session.ticket : body.ticket,
					ticketAt: keepTicket ? session.ticketAt : now(),
				};

				return session;
			} finally {
				pending = null;
			}
		} )();

		return pending;
	}

	function ensureSession() {
		if ( session !== null && now() - session.fetchedAt < SESSION_TTL_MS ) {
			return Promise.resolve( session );
		}

		return refreshSession();
	}

	async function post( values, honeypot ) {
		const response = await fetchImpl( endpoint( restUrl, 'entries' ), {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				form_id: Number( formId ),
				values,
				hp: honeypot,
				ticket: session.ticket,
				nonce: session.nonce,
			} ),
		} );

		return { status: response.status, body: await readJson( response ) };
	}

	async function waitForTicket() {
		const neededWait = clampWait( now() - session.ticketAt );

		if ( neededWait > 0 ) {
			await wait( neededWait );
		}
	}

	async function submit( values, honeypot ) {
		try {
			await ensureSession();

			if ( now() - session.ticketAt < 0 ) {
				// Saat geri düşüb — bu ticket-ə etibar yoxdur, təzəsi alınır.
				await refreshSession();
			}

			await waitForTicket();

			let result = await post( values, honeypot );

			if ( result.status === 403 && result.body && result.body.code === 'qform_expired' ) {
				const ticketBefore = session.ticket;

				await refreshSession();

				// Yenilənmə köhnə ticket-i SAXLAYIBSA, o artıq 3.5 saniyədən
				// böyükdür (əks halda ilk cəhddən əvvəl gözlənilərdi) — əlavə
				// gözləməyə ehtiyac yoxdur. Yalnız TƏZƏ ticket gözləmə tələb edir.
				if ( session.ticket !== ticketBefore ) {
					await waitForTicket();
				}

				result = await post( values, honeypot );
			}

			return result;
		} catch ( error ) {
			return { status: 0, body: null };
		}
	}

	return { ensureSession, submit };
}
