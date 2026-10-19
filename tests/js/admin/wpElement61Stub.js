const React = require( 'react' );

// WordPress 6.1 və köhnəsi React 17 daşıyır: `@wordpress/element` orada
// yalnız `render` verir, `createRoot` yoxdur. Bu stub məhz o səthi
// təqlid edir — adi wpElementStub `createRoot`-u həmişə verdiyi üçün
// versiya müqaviləsini yoxlaya bilmir.
module.exports = {
	...React,
	render: require( 'react-dom' ).render,
};
