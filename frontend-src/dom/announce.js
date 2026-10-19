const DELAY = 500;

export function createAnnouncer( container ) {
	const region = document.createElement( 'p' );

	region.className = 'quoteform_sr_only';
	region.setAttribute( 'aria-live', 'polite' );
	region.setAttribute( 'role', 'status' );
	container.appendChild( region );

	let timer = null;
	let last = '';

	return {
		// Gözləyən elan HƏR dəfə ləğv olunur — eyni mesaj gələndə də. Əks halda
		// dəyəri dəyişib 500ms bitmədən geri qaytaran ziyarətçiyə ekran oxuyucu
		// ekranda ARTIQ olmayan qiyməti deyərdi.
		//
		// `{ force: true }` təkrarı da deyir (məs. eyni xəta ikinci dəfə): sahə
		// dərhal boşaldılır ki, gecikmədən sonra yazılan mətn ekran oxuyucu
		// üçün həqiqi dəyişiklik olsun — eyni mətni üstünə yazmaq çox vaxt
		// səssiz keçir.
		announce( message, { force = false } = {} ) {
			window.clearTimeout( timer );
			timer = null;

			if ( force ) {
				last = '';
				region.textContent = '';
			} else if ( message === last ) {
				return;
			}

			timer = window.setTimeout( () => {
				timer = null;
				last = message;
				region.textContent = message;
			}, DELAY );
		},
		destroy() {
			window.clearTimeout( timer );
			timer = null;
			region.remove();
		},
	};
}
