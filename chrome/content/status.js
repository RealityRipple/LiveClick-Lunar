function init ()
{
 Components.utils.import("resource://liveclick/liveclick.jsm");
 Components.utils.import("resource://liveclick/liveplaces.jsm");
 Components.utils.import("resource://liveclick/prefs.jsm");
 // Import PlacesUtils
 Components.utils.import("resource://gre/modules/PlacesUtils.jsm");
 let dtCurrent = Date.now();
 let dtNext = LiveClick.autoTime;
 let rExpired = [], rNever = [], rNext = [], rFailed = [];
 let iLivemarkCount = 0;
 for (let id in LiveClickPlaces.places)
 {
  let livemark = LiveClickPlaces.places[id];
  if (livemark.type != 1) continue;
  iLivemarkCount++;
  let dtExpire = livemark.getToken("expiration", dtCurrent);
  let title = livemark.title ? livemark.title : livemark.feedURI.spec;
  if (dtExpire < dtCurrent+30000) rExpired.push(title);
  if (dtExpire > dtCurrent+86400000) rNever.push(title);
  if ((dtExpire < dtNext+90000) || (dtExpire > dtCurrent+86400000))
   rNext.push(title);
  if (livemark.getToken("loadfailed", 0) == 1)
   rFailed.push(title);
 }
 Components.utils.import("resource://gre/modules/AddonManager.jsm");
 AddonManager.getAddonByID(LiveClick.extGUID,
  function(addon)
  {
   setValue("extension", "LiveClick Lunar "+addon.version+" ("+LiveClick.buildDate+")");
  }
 );
 setValue("useragent", navigator.userAgent);
 setValue("history", PlacesUtils.history.historyDisabled ? "Disabled" : "Enabled");
 setValue("actives", iLivemarkCount);
 let natives = PlacesUtils.annotations.getItemsWithAnnotation("livemark/feedURI", {});
 setValue("natives", natives.length);
 setValue("checkstart", LiveClickPrefs.getValue("checkOnStart") ? "Yes" : "No");
 setValue("checkauto", LiveClickPrefs.getValue("checkAutomatic") ? "Yes" : "No");
 setValue("checksuspend", LiveClick.isSuspended ? "Yes" : LiveClickPrefs.getValue("checkAutomatic") ? "No" : "Not Available");
 setValue("nexttime", LiveClick.autoTimer ? (new Date(dtNext)).toLocaleString() : "Not Available");
 setValue("nextcount-count", LiveClick.autoTimer ? rNext.length : "n/a");
 setValue("nextcount-list", LiveClick.autoTimer ? rNext.toString() : "");
 setValue("expirenow-count", rExpired.length);
 setValue("expirenow-list", rExpired.toString());
 setValue("expirenever-count", rNever.length);
 setValue("expirenever-list", rNever.toString());
 setValue("failed-count", rFailed.length);
 setValue("failed-list", rFailed.toString());
 for (let sPref in LiveClickPrefs._types)
  addRow("prefs-tbody", [sPref, LiveClickPrefs.getValue(sPref)]);
}
function setValue (aElement, aValue)
{
 let el = document.getElementById(aElement);
 if (el) el.textContent = aValue;
}
function addRow (aTable, aColumns)
{
 let row = document.createElement("tr");
 for (let i = 0; i < aColumns.length; i++)
 {
  let column = document.createElement("td");
  column.textContent = aColumns[i];
  row.appendChild(column);
 }
 document.getElementById(aTable).appendChild(row);
}
function copyToClipboard ()
{
 let sBuffer = "LIVECLICK LUNAR STATUS\n";
 sBuffer += " Generated: "+(new Date)+"\n";
 sBuffer += " Extension: "+LiveClick.extVersion+" ("+LiveClick.buildDate+")"+"\n";
 sBuffer += " User Agent: "+navigator.userAgent+"\n";
 sBuffer += " Browsing History: "+(PlacesUtils.history.historyDisabled ? "Disabled" : "Enabled")+"\n\n";
 sBuffer += "PREFERENCES\n";
 for (let sPref in LiveClickPrefs._types)
  sBuffer += " "+sPref+": "+LiveClickPrefs.getValue(sPref)+"\n";
 if (LiveClickPrefs.getValue("debugLog"))
  sBuffer += "\nLOG\n"+LiveClick.log;
 else
  sBuffer += "\nLOGGING NOT ENABLED";
 let clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
       .createInstance(Components.interfaces.nsIClipboardHelper);
 clipboardHelper.copyString(sBuffer);
}
