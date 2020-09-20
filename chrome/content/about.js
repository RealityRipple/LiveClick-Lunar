function init()
{
	Components.utils.import( "resource://liveclick/liveclick.jsm" );

	var strings = document.getElementById( "extension-strings" );

	var sVersion = strings.
		getFormattedString( "version", [LiveClick.extVersion] );
	var lblVersion = document.getElementById( "extensionVersion" );
	lblVersion.value = sVersion;

	var sDescription = strings.
		getString( "extensions." + LiveClick.extGUID + ".description" );
	var lblDescription = document.getElementById( "extensionDescription" );
	lblDescription.value = sDescription;
}