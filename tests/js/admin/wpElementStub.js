const React = require( 'react' );

module.exports = {
	...React,
	createRoot: require( 'react-dom/client' ).createRoot,
};
