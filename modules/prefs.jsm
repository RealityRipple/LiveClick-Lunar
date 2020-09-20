var EXPORTED_SYMBOLS = [ "LiveClickPrefs" ];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

if (typeof(LiveClickPrefs) == "undefined")
{
	var LiveClickPrefs =
	{
		// Class properties
		_isInitialized : false,
		_service : null,
		_types : {},
		_values : {},

		init : function ()
		{
			this._types =
			{
				"lastVersion" : "string",
				"checkOnDemand" : "bool",
				"checkOnStart" : "bool",
				"checkAutomatic" : "bool",
				"checkWhenIdle" : "bool",
				"defaultInterval" : "int",
				"showCount" : "int",
				"showFavIcons" : "bool",
				"showItemTooltips" : "bool",
				"styleNewAsFresh" : "bool",
				"styleFolderNew" : "int",
				"styleFolderFresh" : "int",
				"styleFolderUnread" : "int",
				"styleFolderRead" : "int",
				"styleFeedNew" : "int",
				"styleFeedFresh" : "int",
				"styleFeedUnread" : "int",
				"styleFeedRead" : "int",
				"styleItemNew" : "int",
				"styleItemFresh" : "int",
				"styleItemUnread" : "int",
				"styleItemRead" : "int",
				"maxFeedItems" : "int",
				"clickLeft" : "int",
				"clickMiddle" : "int",
				"clickAccel" : "int",
				"keepOpenOnMiddle" : "bool",
				"keepOpenExceptLast" : "bool",
				"showAtTop" : "int",
				"showPopupOpen" : "bool",
				"showPopupFeed" : "bool",
				"showPopupTabs" : "bool",
				"showPopupRead" : "bool",
				"itemPreview" : "int",
				"livemarkView" : "int",
				"locationVisit" : "int",
				"browserExit" : "int",
				"browserClear" : "bool",
				"monitorAction" : "int",
				"monitorAll" : "bool",
				"alert1Action" : "int",
				"alert1Read" : "bool",
				"alertNAction" : "int",
				"alertNRead" : "bool",
				"alertForeground" : "bool",
				"alertRepeat" : "int",
				"autoload1Action" : "int",
				"autoload1Read" : "bool",
				"autoloadNAction" : "int",
				"autoloadNRead" : "bool",
				"autoloadAlert" : "bool",
				"liveTagLabel" : "string",
				"liveTagOnRead" : "bool",
				"liveTagAlert" : "bool",
				"debug" : "bool",
				"debugLog" : "bool"
			};

			this._service = Cc["@mozilla.org/preferences-service;1"]
							.getService(Ci.nsIPrefService)
							.getBranch("extensions.liveclick.");
			this._service.QueryInterface(Ci.nsIPrefBranch);
			this._service.addObserver("", this, false);

			this._isInitialized = true;
		},

		getValue : function (aName)
		{
			// Make sure preference types have been loaded first
			if (!this._isInitialized) this.init();

			if (this._values[aName] == null)
				this._values[aName] = this._getPreference(aName);

			return this._values[aName];
		},

		getStyles : function (aType)
		{
			let styles = { 	new : this.getValue("style" + aType + "New"),
							fresh : this.getValue("style" + aType + "Fresh"),
							unread : this.getValue("style" + aType + "Unread"),
							read : this.getValue("style" + aType + "Read"),
							unknown : 0 };

			// Undocumented preference allows fresh to be styled independent of new
			if (this.getValue("styleNewAsFresh"))
				styles.fresh = styles.new;

			return styles;
		},

		_getPreference : function (aName)
		{
			var value = null;
			var sType = this._types[aName];

			try
			{
				switch (sType)
				{
					case "bool":
						value = this._service.getBoolPref(aName);
						break;
					case "int":
						value = this._service.getIntPref(aName);
						break;
					default:
						value = this._service.getCharPref(aName);
						break;
				}
			}
			catch (e)
			{
				// Do Nothing
			}

			return value;
		},

		getDefault : function (aName)
		{
			let defaults = Cc["@mozilla.org/preferences-service;1"]
							.getService(Ci.nsIPrefService)
							.getDefaultBranch("extensions.liveclick.");

			defaults.QueryInterface(Ci.nsIPrefBranch);

			let value = null;
			let sType = this._types[aName];

			try
			{
				switch (sType)
				{
					case "bool":
						value = defaults.getBoolPref(aName);
						break;
					case "int":
						value = defaults.getIntPref(aName);
						break;
					default:
						value = defaults.getCharPref(aName);
						break;
				}
			}
			catch (e)
			{
				// Do Nothing
			}

			return value;
		},

		reset : function ()
		{
			for (pref in this._types)
			{
				if (this._service.prefHasUserValue(pref))
					this._service.clearUserPref(pref);
			}
		},

		observe : function (aSubject, aTopic, aData)
		{
			if (aTopic != "nsPref:changed") return;
			this._values[aData] = this._getPreference(aData);

			if (aData == "defaultInterval")
				this._broadcastChange("liveclick-timer-reset", "true");
			else if (aData == "checkAutomatic")
				this._broadcastChange("liveclick-timer-toggle", !this._values[aData]);
		},

		// Notify observers when preference changes affect timer
		_broadcastChange : function (aTopic, aData)
		{
			Cc["@mozilla.org/observer-service;1"]
				.getService(Ci.nsIObserverService)
				.notifyObservers(null, aTopic, aData);
		},

		stopObserving : function ()
		{
			this._service.removeObserver("", this);
		}
	}
}