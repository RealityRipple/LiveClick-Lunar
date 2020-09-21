const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
// Import Firefox modules
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://liveclick/liveclick.jsm");
Cu.import("resource://liveclick/liveplaces.jsm");
Cu.import("resource://liveclick/prefs.jsm");
Cu.import("resource://liveclick/remote.jsm");
// Settings Constants
const EXT_ENGINE = 1.7;
const ICON_DEFAULT = "chrome://browser/skin/livemark-folder.png";
// List of live bookmarks already monitored
var monitors = [];
function init ()
{
 // Show/hide styleFreshRow based on styleNewAsFresh preference
 var styleAsNew = document.getElementById("styleNewAsFresh");
 var styleFreshRow = document.getElementById("styleFreshRow");
 styleFreshRow.collapsed = styleAsNew.value;
 // Attach popup menu to settings button
 var settings = document.documentElement.getButton("extra2");
 settings.setAttribute("popup", "liveclick-settings");
 settings.setAttribute("dir", "reverse");
 settings.setAttribute("image", "chrome://global/skin/arrow/arrow-up-sharp.gif");
 populateFeedBox();
}
function populateFeedBox ()
{
 var feeds = getFeeds();
 if (feeds.length == 0) return;
 var feedBox = document.getElementById("feedBox");
 var iCount = 0;
 for (let i = 0; i < feeds.length; i++)
 {
  if (feeds[i].monitored) iCount++;
  let icon = ICON_DEFAULT;
  if (LiveClickPrefs.getValue("showFavIcons") && feeds[i].icondata)
   icon = feeds[i].icondata;
  let sFeedURI = feeds[i].feed ? feeds[i].feed.spec : "";
  let li = document.createElement("listitem");
  li.setAttribute("value", feeds[i].id);
  li.setAttribute("label", feeds[i].name ? feeds[i].name : sFeedURI);
  li.setAttribute("tooltiptext", sFeedURI);
  li.setAttribute("type", "checkbox");
  li.setAttribute("checked", feeds[i].monitored);
  li.setAttribute("class", "listitem-iconic");
  li.setAttribute("image", icon);
  li.addEventListener("command", function() { updateFeedCount(this.checked); }, false);
  feedBox.appendChild(li);
 }
 feedBox.setAttribute("checkedCount", iCount);
 // Update counts label
 document.getElementById("countTotal").value =
  iCount.toString() + " / " + feedBox.itemCount.toString();
}
function getFeeds ()
{
 let feeds = [];
 for (let id in LiveClickPlaces.places)
 {
  let livemark = LiveClickPlaces.places[id];
  if (livemark.type != 1) continue;
  let feedObject =
  {
   "id" : livemark.id,
   "name" : livemark.title,
   "feed" : livemark.feedURI,
   "monitored" : livemark.getToken("monitored", 0) == 1,
   "icondata" : livemark.icondata
  };
  feeds.push(feedObject);
  if (feedObject.monitored) monitors.push(livemark.id);
 }
 if (feeds.length > 0)
  feeds.sort(compareFeeds);
 return feeds;
}
function compareFeeds (a, b)
{
 let sValueA = a.name ? a.name : a.feed.spec;
 let sValueB = b.name ? b.name : b.feed.spec;
 if (sValueA.toLowerCase() < sValueB.toLowerCase())
  return -1;
 else if (sValueA.toLowerCase() > sValueB.toLowerCase())
  return 1;
 return 0;
}
function selectFeeds (aAll)
{
 var feedBox = document.getElementById("feedBox");
 for (var i = 0; i < feedBox.itemCount; i++)
 {
  var li = feedBox.getItemAtIndex(i);
  li.setAttribute("checked", aAll == 1);
 }
 var iChecked = aAll ? feedBox.itemCount : 0;
 feedBox.setAttribute("checkedCount", iChecked);
 // Update counts label
 document.getElementById("countTotal").value =
  iChecked.toString() + " / " + feedBox.itemCount.toString();
}
function updateFeedCount (aAdd)
{
 var feedBox = document.getElementById("feedBox");
 var iChecked = parseInt(feedBox.getAttribute("checkedCount"));
 if (aAdd)
  iChecked++;
 else
  iChecked--;
 feedBox.setAttribute("checkedCount", iChecked);
 // Update counts label
 document.getElementById("countTotal").value =
  iChecked.toString() + " / " + feedBox.itemCount.toString();
}
function setMinutes ()
{
 var seconds = document.getElementById("defaultInterval").value;
 seconds = (seconds != null) ? parseInt(seconds) : 3600;
 return seconds / 60;
}
function setSeconds ()
{
 var minutes = document.getElementById("minutesBox").value;
 minutes = (minutes != "") ? parseFloat(minutes) : 0;
 if (minutes <= 0) return 0;
 return minutes * 60;
}
// Toggle child when parent's check state changes
function linkChildOnCheck (aParent, aChild)
{
 var bChecked = document.getElementById(aParent).value;
 var child = document.getElementById(aChild);
 if (child.hasChildNodes())
 {
  for (let i = 0; i < child.childNodes.length; i++)
   child.childNodes[i].disabled = !bChecked;
 }
 else
  child.disabled = !bChecked;
 // Don't override the preference's value in UI
 return undefined;
}
function readMaxFeedItems ()
{
 var iMax = document.getElementById("maxFeedItems").value;
 document.getElementById("cbShowMax")
  .setAttribute("checked", iMax > 0 ? true : false);
 document.getElementById("tbMaxItems").disabled = iMax == 0 ? true : false;
 // Keep UI value regardless of setting
 return iMax > 0 ? iMax : document.getElementById("tbMaxItems").value;
}
function setMaxFeedItems ()
{
 var bChecked = document.getElementById("cbShowMax").getAttribute("checked");
 return bChecked ? document.getElementById("tbMaxItems").value : 0;
}
function toggleMax ()
{
 var bChecked = document.getElementById("cbShowMax").getAttribute("checked");
 document.getElementById("maxFeedItems").value =
  bChecked ? document.getElementById("tbMaxItems").value : 0;
}
// Toggle feeds and select buttons when monitorAll changes
function readMonitorAll ()
{
 var bChecked = document.getElementById("monitorAll").value;
 document.getElementById("feedBox").disabled = bChecked;
 document.getElementById("countLabel").disabled = bChecked;
 document.getElementById("countTotal").disabled = bChecked;
 document.getElementById("selectFeedsAll").disabled = bChecked;
 document.getElementById("selectFeedsNone").disabled = bChecked;
 // Don't override the preference's value in UI
 return undefined;
}
function createSmartBookmark ()
{
 var strings = document.getElementById("liveclick-strings");
 var sLabel = document.getElementById("liveTagLabelBox").value;
 var sURL = "place:queryType=1&sort=14&terms=" + sLabel;
 var uri = Cc["@mozilla.org/network/io-service;1"]
      .getService(Ci.nsIIOService)
      .newURI(sURL, null, null);
 var dArgs =
 {
  action : "add",
  type : "bookmark",
  title : strings.getString("liveTagFolder"),
  uri : uri,
  hiddenRows : "description"
 };
 var dialogURL = "chrome://browser/content/places/bookmarkProperties.xul";
 var features = "centerscreen,chrome,modal,resizable=no";
 window.openDialog(dialogURL, "", features, dArgs);
 return ("performed" in dArgs && dArgs.performed);
}
// Called when prefwindow is closed
// Needed to saveMonitors when instant apply enabled (i.e. Macs, Linux)
function closeDialog ()
{
 let bApply = Cc["@mozilla.org/preferences-service;1"]
     .getService(Ci.nsIPrefService)
     .getBranch("browser.preferences.")
     .getBoolPref("instantApply");
 if (bApply) acceptDialog();
}
function acceptDialog ()
{
 saveMonitors();
 for (let id in LiveClickPlaces.places)
 {
  let livemark = LiveClickPlaces.places[id];
  if (livemark.type != 1) continue;
  livemark.broadcast();
 }
}
function saveMonitors ()
{
 let feedBox = document.getElementById("feedBox");
 if (!feedBox.hasChildNodes()) return;
 let adds = [], kills = [];
 for (let i = 0; i < feedBox.itemCount; i++)
 {
  let li = feedBox.getItemAtIndex(i);
  let iLivemarkId = parseInt(li.getAttribute("value"));
  let bRequest = li.getAttribute("checked") == "true";
  let bPrevious = monitors.indexOf(iLivemarkId) > -1;
  if (bRequest == bPrevious)
   continue;
  if (bRequest)
   adds.push(iLivemarkId);
  else
   kills.push(iLivemarkId);
 }
 if (adds.length > 0)
  LiveClickRemote.setFeedsAnno(adds, "monitored", "1");
 if (kills.length > 0)
  LiveClickRemote.clearFeedsAnno(kills, "monitored");
}
function settingsDefault ()
{
 // Get localized strings
 let strings = document.getElementById("liveclick-strings");
 // Reset preferences
 let prefs = document.getElementsByTagName("preference");
 for (let i = 0; i < prefs.length; i++)
  prefs[i].value = LiveClickPrefs.getDefault(prefs[i].id);
 // Clear custom attributes in places DB
 clearCustoms();
 alert(strings.getString("SettingsDefault"));
}
function settingsImport ()
{
 var fp = Cc["@mozilla.org/filepicker;1"]
    .createInstance(Ci.nsIFilePicker);
 fp.init(window, null, fp.modeOpen);
 fp.appendFilters(fp.filterXML);
 fp.defaultExtension = "xml";
 if (fp.show() == fp.returnCancel) return;
 if (restoreFromFile(fp.file))
 {
  // Get localized strings
  var strings = document.getElementById("liveclick-strings");
  alert(strings.getString("SettingsImport"));
 }
}
function restoreFromFile (aFile)
{
 if (!aFile.exists()) return false;
 var iosvc = Cc["@mozilla.org/network/io-service;1"]
     .getService(Ci.nsIIOService);
 var fiStream = Cc["@mozilla.org/network/file-input-stream;1"]
     .createInstance(Ci.nsIFileInputStream);
 var siStream = Cc["@mozilla.org/scriptableinputstream;1"]
     .createInstance(Ci.nsIScriptableInputStream);
 fiStream.init(aFile, 0x01, 0444, null);
 siStream.init(fiStream);
 var input = siStream.read(fiStream.available());
 siStream.close();
 fiStream.close();
 var parser = new DOMParser();
 var doc = parser.parseFromString(input, "text/xml");
 // Check for valid settings file
 var meta = doc.documentElement.getElementsByTagName("meta");
 if (meta.length != 1) return false;
 var guid = meta[0].getElementsByTagName("ext-guid");
 if (guid.length != 1) return false;
 if (guid[0].textContent != LiveClick.extGUID) return false;
 var engine = meta[0].getElementsByTagName("save-engine");
 var engineVer = engine.length == 1 ? parseFloat(engine[0].textContent) : EXT_ENGINE;
 var i, sID, sValue;
 // Restore preference values
 if (doc.documentElement.getElementsByTagName("prefs").length > 0)
 {
  let prefs = doc.documentElement.
   getElementsByTagName("prefs")[0].getElementsByTagName("pref");
  for (i = 0; i < prefs.length; i++)
  {
   if (!prefs[i].hasAttribute("id")) continue;
   sID = prefs[i].getAttribute("id");
   sValue = prefs[i].textContent;
   let pref = document.getElementById(sID);
   if (pref)
   {
    if (pref.type == "bool")
     pref.value = sValue == "true";
    else
     pref.value = sValue;
    continue;
   }
   // Convert old "on" prefs to new equivalents
   // EXT_ENGINE < 1.6
   if (sID.substr(0, 2) == "on")
   {
    let sNewID = "";
    switch (sID)
    {
     case "onLeftClick":
      sNewID = "clickLeft";
      break;
     case "onMiddleClick":
      sNewID = "clickMiddle";
      break;
     case "onAccelClick":
      sNewID = "clickAccel";
      break;
     case "onBrowserClear":
      sNewID = "browserClear";
      sValue = sValue == "true";
      break;
     default:
      sNewID = sID.substr(2,1).toLowerCase()+sID.substr(3);
      break;
    }
    if (document.getElementById(sNewID))
     document.getElementById(sNewID).value = sValue;
   }
   // Convert readStyle to individual style prefs
   // EXT_ENGINE < 1.2
   if (sID == "readStyle")
   {
    // Array: fresh, unread, read
    var itemStyles = [6, 0, 1];
    var feedStyles = [6, 0, 1];
    switch (parseFloat(sValue))
    {
     case 0:
      itemStyles = [0, 0, 0];
      feedStyles = [0, 0, 0];
      break;
     case 2:
      itemStyles = [6, 0, 2];
      break;
     case 5:
      itemStyles = [5, 5, 0];
      feedStyles = [5, 5, 0];
      break;
     case -1:
      itemStyles = [-1, -1, -1];
      feedStyles = [-1, -1, -1];
      break;
    }
    document.getElementById("styleItemFresh").value = itemStyles[0];
    document.getElementById("styleItemUnread").value = itemStyles[1];
    document.getElementById("styleItemRead").value = itemStyles[2];
    document.getElementById("styleFeedFresh").value = feedStyles[0];
    document.getElementById("styleFeedUnread").value = feedStyles[1];
    document.getElementById("styleFeedRead").value = feedStyles[2];
   }
  }
 }
 // Clear custom attributes in places DB
 clearCustoms();
 // Restore monitors
 if (doc.documentElement.getElementsByTagName("monitors").length > 0)
 {
  var feedBox = document.getElementById("feedBox");
  // First uncheck all items
  for (i = 0; i < feedBox.itemCount; i++)
   feedBox.getItemAtIndex(i).setAttribute("checked", false);
  // Get list of monitored feeds from settings file
  var monitors = doc.documentElement.
   getElementsByTagName("monitors")[0].getElementsByTagName("monitor");
  var iCount = 0;
  for (i = 0; i < monitors.length; i++)
  {
   var sFeed = null;
   // v1.1: Get feed from feed child instead of ID attribute
   if (monitors[i].getElementsByTagName("feed").length > 0)
    sFeed = monitors[i].getElementsByTagName("feed")[0].textContent;
   // v1.0: Get feed from ID attribute
   else if (monitors[i].hasAttribute("id"))
    sFeed = monitors[i].getAttribute("id");
   if (!sFeed) continue;
   // v1.3: Restore custom attributes from settings file
   var sSite = monitors[i].getElementsByTagName("site").length > 0 ?
       monitors[i].getElementsByTagName("site")[0].textContent : "";
   var iInterval = monitors[i].getElementsByTagName("interval").length > 0 ?
       parseInt(monitors[i].getElementsByTagName("interval")[0].textContent) : -1;
   var iAction = monitors[i].getElementsByTagName("action").length > 0 ?
       parseInt(monitors[i].getElementsByTagName("action")[0].textContent) : -1;
   // v1.5: Restore custom max from settings file
   var iMax = monitors[i].getElementsByTagName("max").length > 0 ?
      parseInt(monitors[i].getElementsByTagName("max")[0].textContent) : -1;
   // v1.7: Restore favicon data from settings file
   var sIconData = monitors[i].getElementsByTagName("icondata").length > 0 ?
       monitors[i].getElementsByTagName("icondata")[0].textContent : "";
   var li = feedBox.getElementsByAttribute("tooltiptext", sFeed);
   for (let j = 0; j < li.length; j++)
   {
    // Custom attributes are instant apply, so can't cancel dialog after this
    let iLivemarkId = parseInt(li[j].getAttribute("value"));
    if (sSite != "") LiveClickPlaces.getPlace(iLivemarkId).setToken("siteURI", sSite);
    if (iInterval > 0) LiveClickPlaces.getPlace(iLivemarkId).setToken("custom_interval", iInterval);
    if (iAction > 0) LiveClickPlaces.getPlace(iLivemarkId).setToken("custom_action", iAction);
    if (iAction != 0)
    {
     li[j].setAttribute("checked", true);
     iCount++;
    }
    if (iMax >= 0) LiveClickPlaces.getPlace(iLivemarkId).setToken("custom_max", iMax);
    let siteURI = LiveClickPlaces.getPlace(iLivemarkId).siteURI;
    if (!siteURI) continue;
    if (sIconData != "")
    {
     LiveClickRemote.setIconDataURL(iLivemarkId, sIconData);
     LiveClickPlaces.getPlace(iLivemarkId).cacheFavicon(false);
     li[j].setAttribute("class", "listitem-iconic");
     li[j].setAttribute("image", sIconData);
    }
   }
  }
  // Update counts label
  feedBox.setAttribute("checkedCount", iCount);
  document.getElementById("countTotal").value =
   iCount.toString() + " / " + feedBox.itemCount.toString();
 }
 // Import successful
 return true;
}
function settingsExport ()
{
 var fp = Cc["@mozilla.org/filepicker;1"].
    createInstance(Ci.nsIFilePicker);
 fp.init(window, null, fp.modeSave);
 fp.appendFilters(fp.filterXML);
 fp.defaultExtension = "xml";
 fp.defaultString = "liveclick-settings";
 if (fp.show() != fp.returnCancel)
 {
  var sXML = '<?xml version="1.0"?>\n';
  sXML += '<liveclick-settings>';
  sXML += makeXMLMeta();
  sXML += makeXMLPrefs();
  sXML += makeXMLMonitors();
  sXML += '</liveclick-settings>';
  var foStream = Cc["@mozilla.org/network/file-output-stream;1"].
                         createInstance(Ci.nsIFileOutputStream);
  var file = fp.file;
  foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
  foStream.write(sXML, sXML.length);
  foStream.close();
 }
}
function makeXMLMeta ()
{
 var sXML = '<meta>\n';
 sXML += '<ext-guid>' + LiveClick.extGUID + '</ext-guid>\n';
 sXML += '<ext-version>' + LiveClick.extVersion + '</ext-version>\n';
 sXML += '<save-engine>' + EXT_ENGINE + '</save-engine>\n';
 sXML += '</meta>\n';
 return sXML;
}
function makeXMLPrefs ()
{
 var sXML = '<prefs>\n';
 var prefs = document.getElementsByTagName("preference");
 for (var i = 0; i < prefs.length; i++)
 {
  var p = prefs[i];
  var sNode = '<pref id="' + p.id + '">' + p.value + '</pref>';
  sXML += sNode + "\n";
 }
 sXML += '</prefs>\n';
 return sXML;
}
function makeXMLMonitors ()
{
 var sXML = '<monitors>\n';
 var feedBox = document.getElementById("feedBox");
 for (let i = 0; i < feedBox.itemCount; i++)
 {
  let li = feedBox.getItemAtIndex(i);
  let bMonitored = li.getAttribute("checked") == "true";
  let iLivemarkId = parseInt(li.getAttribute("value"));
  let sFeed = li.getAttribute("tooltiptext");
  let sSite = LiveClickPlaces.getPlace(iLivemarkId).getToken("custom_site", "");
  let iInterval = LiveClickPlaces.getPlace(iLivemarkId).getToken("custom_interval", -1);
  let iAction = LiveClickPlaces.getPlace(iLivemarkId).getToken("custom_monitor", 0);
  let iMax = LiveClickPlaces.getPlace(iLivemarkId).getToken("custom_max", -1);
  let sIconData = LiveClickPlaces.getPlace(iLivemarkId).icondata;
  // If monitored but no custom action specified, set action to default (-1)
  if (bMonitored && iAction == 0) iAction = -1;
  if (!bMonitored && sSite == "" && iInterval == -1
   && iAction == 0 && iMax == -1 && sIconData == "")
   continue;
  var sNode = '<monitor>\n';
  sNode += '<feed><![CDATA[' + sFeed + ']]></feed>\n';
  if (sSite != "") sNode += '<site><![CDATA[' + sSite + ']]></site>\n';
  if (iInterval > -1) sNode += '<interval>' + iInterval + '</interval>\n';
  sNode += '<action>' + iAction + '</action>\n';
  if (iMax > -1) sNode += '<max>' + iMax + '</max>\n';
  if (sIconData) sNode += '<icondata><![CDATA[' + sIconData + ']]></icondata>\n';
  sNode += '</monitor>';
  sXML += sNode + "\n";
 }
 sXML += '</monitors>\n';
 return sXML;
}
function clearCustoms ()
{
 LiveClickRemote.clearFeedsAnno([], "custom_site");
 LiveClickRemote.clearFeedsAnno([], "custom_max");
 LiveClickRemote.clearFeedsAnno([], "custom_interval");
 LiveClickRemote.clearFeedsAnno([], "custom_monitor");
}
