const { utils: Cu } = Components;
Cu.import("resource://liveclick/liveclick.jsm");
Cu.import("resource://liveclick/liveplaces.jsm");
Cu.import("resource://liveclick/prefs.jsm");
if (typeof(LiveClickChrome) == "undefined")
{
 var LiveClickChrome = {};
}
// LiveClick places properties dialog overlay class
LiveClickChrome.Props =
{
 strings : null,
 _element : function (aId)
 {
  return document.getElementById(aId);
 },
 // Initialization code
 init : function ()
 {
  this.strings = document.getElementById("liveclick-strings");
  let itemId;
  let bMonitored = false, iMonitor = 0;
  let bMonitorAll = false;
  let iMonitorDefault = 0;
  let dialogInfo = window.arguments[0];
  if (dialogInfo.action == "edit")
  {
   itemId = gEditItemOverlay.itemId;
   if (LiveClickPlaces.getType(itemId) != 1) return;
   bMonitored = LiveClickPlaces.getPlace(itemId).getToken("monitored", 0) > 0;
   bMonitorAll = LiveClickPrefs.getValue("monitorAll");
   iMonitorDefault = (bMonitored || bMonitorAll) ? -1 : 0;
   iMonitor = LiveClickPlaces.getPlace(itemId).getToken("custom_monitor", iMonitorDefault);
  }
  // Break here if not adding a livemark
  else if (dialogInfo.type != "livemark")
   return;
  // Hide native live bookmark fields
  let oriShowHide = gEditItemOverlay._showHideRows;
  gEditItemOverlay._showHideRows = function ()
  {
   this._isLivemark = false;
   oriShowHide.apply(this, arguments);
  }
  // Populate additional fields, init values with live bookmark annotations
  let txtFeed = this._element("customFeedLocation");
  txtFeed.value = LiveClickPlaces.getPlace(itemId).feedURI.spec;
  txtFeed.setAttribute("initvalue", txtFeed.value);
  let txtSite = this._element("customSiteLocation");
  let site = LiveClickPlaces.getPlace(itemId).siteURI;
  if (site)
  {
   txtSite.value = site.spec;
   txtSite.setAttribute("initvalue", txtSite.value);
  }
  let cbMonitor = this._element("monitorCheckbox");
  cbMonitor.setAttribute("checked", bMonitored || bMonitorAll);
  if (bMonitorAll)
  {
   cbMonitor.setAttribute("label", cbMonitor.getAttribute("labelAll"));
   cbMonitor.disabled = true;
  }
  // Update intervals stored as seconds, but displayed as minutes
  let iInterval = LiveClickPlaces.getPlace(itemId).getToken("custom_interval", -1);
  this._element("customInterval").setAttribute("initvalue", iInterval);
  switch (iInterval)
  {
   case -1:
   case 600:
   case 900:
   case 1800:
   case 3600:
   case 7200:
   case 14400:
   case 21600:
    this._element("customInterval").value = iInterval;
    break;
   default:
    this._element("checkCustom").label =
     this.strings.getFormattedString("checkCustom", [iInterval/60]);
    this._element("checkCustom").value = iInterval;
    this._element("customInterval").value = iInterval;
    break;
  }
  let iIntervalDefault = LiveClickPrefs.getValue("defaultInterval");
  this._element("checkDefault").label =
   this.strings.getFormattedString("checkDefault", [iIntervalDefault/60]);
  let lstMonitor = this._element("customMonitor");
  lstMonitor.value = iMonitor;
  lstMonitor.setAttribute("initvalue", iMonitor);
  let iMaxDefault = LiveClickPrefs.getValue("maxFeedItems");
  let iMax = LiveClickPlaces.getPlace(itemId).getToken("custom_max", iMaxDefault);
  // Custom max set
  if (iMax > 0)
  {
   this._element("customMax").value = iMax;
   this._element("customMax").setAttribute("initvalue", iMax);
   this._element("cbShowMax").setAttribute("initvalue", true);
   this.checkMax(true);
  }
  // Global max set, but custom set to show all
  else if (iMax == 0 && iMaxDefault > 0)
  {
   this._element("customMax").value = iMaxDefault;
   this._element("customMax").setAttribute("initvalue", 0);
   this._element("cbShowMax").setAttribute("initvalue", false);
  }
  // Show custom live bookmark fields
  this._element("customFeedLocationRow").removeAttribute("collapsed");
  this._element("customSiteLocationRow").removeAttribute("collapsed");
  this._element("liveclickRow").removeAttribute("collapsed");
  // Unhide custom settings if any are set
  if (iInterval > 0 || iMonitor != iMonitorDefault || iMax != iMaxDefault)
   this.toggleFeedSettings(false);
  // !! Comment out this resizeTo before releasing !!
  //window.resizeTo(400, window.outerHeight);
  window.addEventListener("dialogaccept", function () { LiveClickChrome.Props.accept(); }, true);
 },
 accept : function ()
 {
  let itemId = gEditItemOverlay.itemId;
  if (itemId == -1) return;
  // Check against init values to see if saving is even necessary
  // Feed location
  let txtFeed = this._element("customFeedLocation");
  if (txtFeed.value != txtFeed.getAttribute("initvalue"))
   LiveClickPlaces.getPlace(itemId).setToken("custom_feed", txtFeed.value);
  // Site location
  let txtSite = this._element("customSiteLocation");
  if (txtSite.value != txtSite.getAttribute("initvalue"))
   LiveClickPlaces.getPlace(itemId).setToken("custom_site", txtSite.value);
  // Custom interval
  let lstInterval = this._element("customInterval");
  if (lstInterval.value != lstInterval.getAttribute("initvalue"))
   LiveClickPlaces.getPlace(itemId).setToken("custom_interval", lstInterval.value);
  // Custom monitor action
  let lstMonitor = this._element("customMonitor");
  if (lstMonitor.value != lstMonitor.getAttribute("initvalue"))
  {
   let iMonitor = lstMonitor.value;
   let bMonitorAll = LiveClickPrefs.getValue("monitorAll");
   // Toggle monitor off/on if monitoring manually
   if (!bMonitorAll && iMonitor == 0)
    LiveClickPlaces.getPlace(itemId).setToken("monitored", "");
   else if (!bMonitorAll)
    LiveClickPlaces.getPlace(itemId).setToken("monitored", true);
   // Remove custom monitor if set to default or do nothing on manual monitoring
   if (iMonitor == -1 || (!bMonitorAll && iMonitor == 0))
    LiveClickPlaces.getPlace(itemId).setToken("custom_monitor", "");
   else
    LiveClickPlaces.getPlace(itemId).setToken("custom_monitor", iMonitor);
  }
  // Custom max
  let txtMax = this._element("customMax");
  let iMaxDefault = LiveClickPrefs.getValue("maxFeedItems");
  let bMaxed = this._element("cbShowMax").getAttribute("checked");
  // Custom value changed, so update
  if (bMaxed && txtMax.value != txtMax.getAttribute("initvalue"))
  {
   // Remove custom max if set to default; otherwise, update
   if (txtMax.value == iMaxDefault)
    LiveClickPlaces.getPlace(itemId).setToken("custom_max", "");
   else
    LiveClickPlaces.getPlace(itemId).setToken("custom_max", txtMax.value);
  }
  // Check state changed
  else if (bMaxed != this._element("cbShowMax").getAttribute("initvalue"))
  {
   // Remove custom max
   if (!bMaxed && iMaxDefault == 0)
    LiveClickPlaces.getPlace(itemId).setToken("custom_max", "");
   // Global max set but custom max unchecked (i.e. show all)
   else if (!bMaxed)
    LiveClickPlaces.getPlace(itemId).setToken("custom_max", "0");
   // Custom max set to non-global max
   else if (txtMax.value != iMaxDefault)
    LiveClickPlaces.getPlace(itemId).setToken("custom_max", txtMax.value);
  }
  // Broadcast now so changes are immediately implemented
  LiveClickPlaces.getPlace(itemId).broadcast();
 },
 checkMonitor : function (aSource)
 {
  // Ignore checkbox if all live bookmarks are monitored
  if (LiveClickPrefs.getValue("monitorAll")) return;
  if (aSource == "menu")
  {
   let cbMonitor = this._element("monitorCheckbox");
   if (this._element("customMonitor").value == "0")
    cbMonitor.setAttribute("checked", false);
   else
    cbMonitor.setAttribute("checked", true);
  }
  else
  {
   let lstMonitor = this._element("customMonitor");
   if (this._element("monitorCheckbox").getAttribute("checked"))
    lstMonitor.value = "-1";
   else
    lstMonitor.value = "0";
  }
 },
 onIntervalSelect : function ()
 {
  let lstInterval = this._element("customInterval");
  if (lstInterval.selectedIndex != 8) return;
  lstInterval.setAttribute("hidden", true);
  let txtInterval = this._element("txtInterval");
  let mnuCustom = this._element("checkCustom");
  txtInterval.value = mnuCustom.value >= 60 ? mnuCustom.value / 60 : 60;
  txtInterval.removeAttribute("hidden");
  txtInterval.select();
  this._element("lblUnit").removeAttribute("hidden");
 },
 onIntervalBlur : function ()
 {
  let txtInterval = this._element("txtInterval");
  txtInterval.setAttribute("hidden", true);
  this._element("lblUnit").setAttribute("hidden", true);
  let lstInterval = this._element("customInterval");
  lstInterval.value = txtInterval.value * 60;
  if (lstInterval.selectedIndex == -1)
  {
   let mnuCustom = this._element("checkCustom");
   mnuCustom.value = txtInterval.value * 60;
   mnuCustom.label = this.strings.getFormattedString("checkCustom", [txtInterval.value]);
   lstInterval.value = mnuCustom.value;
  }
  lstInterval.removeAttribute("hidden");
 },
 checkMax : function (aToggle)
 {
  let bChecked = aToggle ? aToggle : this._element("cbShowMax").getAttribute("checked");
  this._element("cbShowMax").setAttribute("checked", bChecked);
  this._element("customMax").disabled = !bChecked;
 },
 toggleFeedSettings : function (aResize)
 {
  let expander = this._element("feedToggler");
  let settings = this._element("feedSettings");
  let iHeight, iWidth;
  if (!settings.collapsed)
  {
   // Get height before collapsing
   iHeight = -settings.boxObject.height;
   expander.className = "expander-down";
   settings.collapsed = true;
  }
  else
  {
   expander.className = "expander-up";
   settings.collapsed = false;
   iHeight = settings.boxObject.height;
  }
  if (aResize)
   window.resizeTo(window.outerWidth, window.outerHeight + iHeight);
 }
}
function logMessage (aMessage)
{
 Cc["@mozilla.org/observer-service;1"]
  .getService(Ci.nsIObserverService)
  .notifyObservers(null, "liveclick-logging", aMessage);
}
window.addEventListener("load", function() { LiveClickChrome.Props.init(); }, false);
