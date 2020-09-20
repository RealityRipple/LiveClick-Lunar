var EXPORTED_SYMBOLS = [ "LiveClick" ];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

// Import Firefox modules
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm");

Cu.import("resource://liveclick/liveplaces.jsm");
Cu.import("resource://liveclick/prefs.jsm");

// Primary LiveClick class
if (typeof(LiveClick) == "undefined")
{
	var LiveClick =
	{
		extGUID : "{7A86970F-5198-5370-9FCB-0EE0150876F7}",
		extVersion : "1.1",
		buildDate : "20200919",

		_isInitialized : false,
		_isDisabling : false,
		_isUninstalling : false,

		isSuspended : false,
		autoTimer : null,
		autoTime : 0,

		log : "",

		init : function ()
		{
			// Only initialize everything else once
			if (this._isInitialized) return;

			LiveClick.debug("LiveClick Lunar initializing...");

			// Initialize livemarks
			LiveClickPlaces.init();

			// Initialize local preferences
			LiveClickPrefs.init();

			// Observe private browsing, preference changes that affect automatic checking
			let observers = Cc["@mozilla.org/observer-service;1"]
							.getService(Ci.nsIObserverService);
			observers.addObserver(LC_Observer, "liveclick-init-complete", false);
			observers.addObserver(LC_Observer, "liveclick-timer-reset", false);
			observers.addObserver(LC_Observer, "liveclick-timer-toggle", false);
			observers.addObserver(LC_Observer, "liveclick-checking", false);
			observers.addObserver(LC_Observer, "liveclick-logging", false);

			// Observe places init/shutdown
			observers.addObserver(LC_Observer, "places-shutdown", false);

			// Observe annotation changes to reset check timers
			PlacesUtils.annotations.addObserver(LC_Observer, false);

			// Check LiveClick version and listen for uninstall/disable requests
			AddonManager.getAddonByID(this.extGUID, function(addon) { LiveClick.extVersion = addon.version; });
			AddonManager.addAddonListener(LC_Observer);

			this._isInitialized = true;
		},

		shutdown : function ()
		{
			// Kill any running LiveClick observers, services
			if (LiveClickPlaces.isChecking) LiveClickPlaces.stopCheck();

			// Kill update timer
			LiveClick.killNextCheck();

			// Remove observers
			let observers = Cc["@mozilla.org/observer-service;1"]
							.getService(Ci.nsIObserverService);
			observers.removeObserver(LC_Observer, "liveclick-init-complete");
			observers.removeObserver(LC_Observer, "liveclick-timer-reset");
			observers.removeObserver(LC_Observer, "liveclick-timer-toggle");
			observers.removeObserver(LC_Observer, "liveclick-checking");
			observers.removeObserver(LC_Observer, "liveclick-logging");
			observers.removeObserver(LC_Observer, "places-shutdown");

			PlacesUtils.annotations.removeObserver(LC_Observer);

			LiveClickPrefs.stopObserving();

			// Perform exit tasks on places
			LiveClickPlaces.shutdown();

			// Get rid of everything if uninstalling
			if (LiveClick._isUninstalling)
				LiveClickPlaces.purgeData();
		},

		setFirstCheck : function ()
		{
			// Don't set timer if one already enabled, checks suspended, or check in progress
			if (this.autoTimer || this.isSuspended || LiveClickPlaces.isChecking)
				return;

			let iDelay = 0;

			// Wait 15s before starting first check
			//	TODO: Allow custom delay from undocumented preference
			if (LiveClickPrefs.getValue("checkOnStart"))
				iDelay = 15000;
			// Wait until next expire (must be at least 5 minutes from now)
			else if (LiveClickPrefs.getValue("checkAutomatic"))
				iDelay = Math.max(LiveClickPlaces.getNextExpire() - Date.now(), 300000);

			if (iDelay == 0) return;

			let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
			timer.initWithCallback(LiveClickPlaces.checkExpired, iDelay, Ci.nsITimer.TYPE_ONE_SHOT);
			this.autoTimer = timer;
			this.autoTime = Date.now()+iDelay;

			let sDelay = iDelay <= 60000 ? Math.ceil(iDelay/1000)+" seconds."
											: Math.ceil(iDelay/60000)+" minutes.";
			LiveClick.debug("First check in "+sDelay);
		},

		setNextCheck : function (aDelay)
		{
			// Do nothing if already firing
			//	New timer will be set after current check, if needed
			if (LiveClickPlaces.isChecking) return;

			this.killNextCheck();

			// Don't set a new timer if automatic checking disabled or suspended
			if (!LiveClickPrefs.getValue("checkAutomatic") || this.isSuspended)
				return;

			let iDelay = aDelay ? aDelay : 0;
			if (isNaN(iDelay) || iDelay == 0)
			{
				// Calculate timer based on next expire
				// 	Automatic checks shouldn't happen more than once per minute
				iDelay = Math.max(LiveClickPlaces.getNextExpire() - Date.now(), 60000);
			}

			let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
			timer.initWithCallback(LiveClickPlaces.checkExpired, iDelay, Ci.nsITimer.TYPE_ONE_SHOT);
			this.autoTimer = timer;
			this.autoTime = Date.now()+iDelay;

			LiveClick.debug("Next check in "+Math.ceil(iDelay/60000)+" minutes.");
		},

		// Cancel automatic timer
		killNextCheck : function ()
		{
			if (!this.autoTimer) return;

			this.autoTimer.cancel();
			this.autoTimer = null;
			this.autoTime = null;
		},

		toggleSuspend : function (aSuspend)
		{
			if (aSuspend === true || aSuspend === false)
				this.isSuspended = aSuspend;
			else
				this.isSuspended = !this.isSuspended;

			// Stops checks in progress and kills timer
			if (this.isSuspended)
			{
				if (LiveClickPlaces.isChecking || this.autoTimer)
				{
					LiveClickPlaces.stopCheck();
					LiveClick.debug("Manually aborted check/timer");
				}
			}
			// Start autochecks immediately on resume
			else
			{
				this.setNextCheck();
			}

			// Notify observers of suspend state change
			Cc["@mozilla.org/observer-service;1"]
				.getService(Ci.nsIObserverService)
				.notifyObservers(null, "liveclick-suspend", this.isSuspended);
		},

		// Write a message to the JavaScript console
		print : function gLC_print (aMessage)
		{
			Cc["@mozilla.org/consoleservice;1"]
				.getService(Ci.nsIConsoleService)
				.logStringMessage(aMessage);
		},

		// Write a timestamped message to the console in debug mode only
		debug : function gLC_debug (aMessage)
		{
			var sTime = (new Date).toLocaleTimeString();

			if (LiveClickPrefs.getValue("debug"))
				this.print("[LC "+sTime+"] "+aMessage);

			if (LiveClickPrefs.getValue("debugLog"))
				LiveClick.log += "["+sTime+"] "+aMessage+"\n";
		},

		// Prints list of an object's properties for debugging purposes
		props : function gLC_props (aObject)
		{
			var sBuffer = "";
			for (let el in aObject)
				sBuffer += el+":\n"+aObject[el]+"\n\n";

			this.print(sBuffer);
		}
	}
}

// LiveClick's uber observer
//  cf http://mxr.mozilla.org/mozilla/source/toolkit/components/places/public/
var LC_Observer =
{
	// nsIAnnotationService
	onItemAnnotationSet : function (aItemId, aAnnotationName)
	{
		switch (aAnnotationName)
		{
			// Reset check timer
			case "liveclick/custom_interval":
				LiveClick.setNextCheck();
				break;
		}
	},

	onItemAnnotationRemoved : function (aItemId, aAnnotationName) {},
	onPageAnnotationSet : function (aUri, aAnnotationName) {},
	onPageAnnotationRemoved : function (aUri, aAnnotationName) {},

	// Listen for uninstall/disable operations
	onDisabling : function (aAddon, aRestart)
	{
		if (aAddon.id != LiveClick.extGUID) return;
		LiveClick._isDisabling = true;
	},

	onUninstalling : function (aAddon, aRestart)
	{
		if (aAddon.id != LiveClick.extGUID) return;
		LiveClick._isUninstalling = true;
	},

	onOperationCancelled : function (aAddon)
	{
		if (aAddon.id != LiveClick.extGUID) return;
		LiveClick._isUninstalling = (aAddon.pendingOperations & AddonManager.PENDING_UNINSTALL) != 0;
	},

	// Observe notification topics
	observe : function (aSubject, aTopic, aData)
	{
		switch (aTopic)
		{
			case "places-shutdown":
				LiveClick.shutdown();
				break;
			case "liveclick-init-complete":
				LiveClick.setFirstCheck();
				break;
			case "liveclick-timer-reset":
				LiveClick.setNextCheck();
				break;
			case "liveclick-timer-toggle":
				LiveClick.toggleSuspend(aData == "true");
				break;
			case "liveclick-checking":
				if (aData == "false") LiveClick.setNextCheck();
				break;
			case "liveclick-logging":
				LiveClick.debug(aData);
				break;
		}
	}
}