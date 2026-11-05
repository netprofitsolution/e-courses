// FS SCORM - fscommand adapter for ADL SCORM 1.2 and Flash MX 2004 Learning Interactions
// version 1.0    08/19/03
// Modified by Andrew Chemey, Macromedia
// Based on FS SCORM adapater version 1.2.4:
// 		Fragments Copyright 2002 Pathlore Software Corporation All rights Reserved
// 		Fragments Copyright 2002 Macromedia Inc. All rights reserved.
// 		Fragments Copyright 2003 Click2learn, Inc. All rights reserved.
// 		Developed by Tom King, Macromedia,
// 		             Leonard Greenberg, Pathlore,
// 		             and Claude Ostyn, Click2learn, Inc.
// 		Includes code by Jeff Burton and Andrew Chemey, Macromedia (01/09/02)
// -----------------------------------------------------------------
// Change these preset values to suit your taste and requirements.
var g_bShowApiErrors = false; 	// change to true to show error messages
var g_bInitializeOnLoad = true; // change to false to not initialize LMS when HTML page loads
// Translate these strings if g_bShowApiErrors is true
// and you need to localize the application
var g_strAPINotFound = "Management system interface not found.";
var g_strAPITooDeep = "Cannot find API - too deeply nested.";
var g_strAPIInitFailed = "Found API but LMSInitialize failed.";
var g_strAPISetError = "Trying to set value but API not available.";
var g_strFSAPIError = 'LMS API adapter returned error code: "%1"\nWhen FScommand called API.%2\nwith "%3"';
var g_strDisableErrorMsgs = "Select cancel to disable future warnings.";
// Change g_bSetCompletedAutomatically to true if you want the status to
// be set to completed automatically when calling LMSFinish. Normally,
// this flag remains false if the Flash movie itself sets status
// to completed by sending a FSCommand to set status to "completed",
// "passed" or "failed" (both of which imply "completed")
var g_bSetCompletedAutomatically = false;
// This value is normally given by the LMS, but in case it is not
// this is the default value to use to determine passed/failed.
// Set this null if the Flash actionscript uses its own method
// to determine passed/fail, otherwise set to a value from 0 to 1
// inclusive (may be a floating point value, e.g "0.75".
var g_SCO_MasteryScore = null; // allowable values: 0.0..1.0, or null
//==================================================================
// WARNING!!!
// Do not modify anything below this line unless you know exactly what
// you are doing!
// You should not have to change these two values as the Flash template
// presets are based on them.
var g_nSCO_ScoreMin = 0; 		// must be a number
var g_nSCO_ScoreMax = 100; 		// must be a number > nSCO_Score_Min
// Per SCORM specification, the LMS provided mastery score,
// if any, will override the SCO in interpreting whether the score
// should be interpreted when the pass/fail status is determined.
// The template tries to obtain the mastery score, and if it
// is available, to set the status to passed or failed accordingly
// when the SCO sends a score. The LMS may not actually make the
// determination until the SCO has been terminated.
// Default value for this flag is true. Set it to false if don't
// want to predict how the LMS will set pass/fail status based on
// the mastery score (the LMS will win in the end anyway).
var g_bInterpretMasteryScore = false;
// This script implements various aspects of
// common logic behavior of a SCO.
/////////// API INTERFACE INITIALIZATION AND CATCHER FUNCTIONS ////////
var g_nFindAPITries = 0;
var g_objAPI = null;
var g_bInitDone = false;
var g_bFinishDone = false;
var	g_bSCOBrowse = false;
var g_apiWindow = null;
var g_bNavRequested = false; // a 2004 LMS was told how to exit (it closes the player itself)
var g_dtmInitialized = new Date(); // will be adjusted after initialize
var g_bMasteryScoreInitialized = false;
var g_ver = "";
var g_keys12 = {
    "cmi.core.lesson_mode": "mode",
    "cmi.core.lesson_status" : ["completion_status", "success_status"],
    "cmi.core.lesson_location": "location",
    "cmi.core.score.raw": "score_raw",
    "cmi.core.score.max": "score_max",
    "cmi.core.score.min": "score_min",
    "cmi.core.student_id": "learner_id",
    "cmi.core.student_name": "learner_name",
    "cmi.core.session_time": "session_time",
    "cmi.core.exit": "exit",
};
var g_prop = {};
function AlertUserOfAPIError(strText) {
    if (g_bShowApiErrors) {
        var s = strText + "\n\n" + g_strDisableErrorMsgs;
        if (!confirm(s)){
            g_bShowApiErrors = false
        }
    }
}
function ExpandString(s){
    var re = new RegExp("%","g")
    for (i = arguments.length-1; i > 0; i--){
        s2 = "%" + i;
        if (s.indexOf(s2) > -1){
            re.compile(s2,"g")
            s = s.replace(re, arguments[i]);
        }
    }
    return s
}
function FindAPI(win, prop = 'API') {
    while ((win[prop] == null) && (win.parent != null) && (win.parent != win)) {
        g_nFindAPITries ++;
        if (g_nFindAPITries > 500) {
            AlertUserOfAPIError(g_strAPITooDeep);
            return null;
        }
        win = win.parent;
    }
    if (win[prop] != null) g_apiWindow = win;
    return win[prop];
}
// Open eLMS's own runtime (Moodle-derived SCORMapi1_2/SCORMapi1_3; its player
// page play_scorm.php defines postToParentApi) keeps the exit it always got
// (OPENHELP-4259): its server-side 2004 sequencing fails on exitAll and loses
// the final commit, and its 1.2 runtime never stores an empty exit, which the
// manager "quiz failed" mail waits for. It offers new attempts by resetting
// the record, not from the exit, so nothing is lost there.
function SCOIsOpenElmsRuntime() {
    try {
        if (g_apiWindow && typeof g_apiWindow.postToParentApi === "function") return true;
    } catch (e) {}
    try {
        var name = g_objAPI && g_objAPI.constructor ? g_objAPI.constructor.name : "";
        if (name === "SCORMapi1_2" || name === "SCORMapi1_3") return true;
    } catch (e) {}
    return false;
}
function APIOK() {
    return ((typeof(g_objAPI)!= "undefined") && (g_objAPI != null))
}
function GetAPIMethod(method) {
    if (!g_ver) {
        g_ver = g_objAPI.LMSInitialize ? "1.2" : "2004";
        if (g_ver === "1.2") {
            for (var prop in g_keys12) {
                var keys = Array.isArray(g_keys12[prop]) ? g_keys12[prop] : [g_keys12[prop]];
                for (var i=0; i<keys.length; i++) {
                    g_prop[keys[i]] = prop;
                }
            }
        }
        else {
            g_prop.mode = "cmi.mode";
            g_prop.completion_status = "cmi.completion_status";
            g_prop.success_status = "cmi.success_status";
            g_prop.location = "cmi.location";
            g_prop.score_raw = "cmi.score.raw";
            g_prop.score_min = "cmi.score.min";
            g_prop.score_max = "cmi.score.max";
            g_prop.score_scaled = "cmi.score.scaled";
            g_prop.learner_id = "cmi.learner_id";
            g_prop.learner_name = "cmi.learner_name";
            g_prop.session_time = "cmi.session_time";
            g_prop.exit = "cmi.exit";
        }
    }
    if (g_ver === "1.2") {
        if (method === "Terminate") {
            method = "Finish";
        }
        if (method.substr(0, 3) !== "LMS" && method.substr(0, 6) !== "appExt") {
            method = "LMS" + method;
        }
    }
    else { // 2004
        if (method.substr(0, 3) === "LMS") {
            method = method.substr(3);
        }
        if (method === "Finish") {
            method = "Terminate";
        }
    }
    return method;
}
function CallAPI() {
    if (arguments.length === 0) return;
    var args = Array.prototype.slice.call(arguments);
    var method = args.shift();
    return g_objAPI[GetAPIMethod(method)].apply(g_objAPI, args);
}
function SCOInitialize() {
    var err = true;
    if (!g_bInitDone) {
        try {
            if ((window.parent) && (window.parent != window)){
                g_objAPI = FindAPI(window.parent);
                if (g_objAPI == null) {
                    g_objAPI = FindAPI(window.parent, 'API_1484_11');
                }
            }
            if ((g_objAPI == null) && (window.opener != null))	{
                g_objAPI = FindAPI(window.opener);
                if (g_objAPI == null) {
                    g_objAPI = FindAPI(window.opener, 'API_1484_11');
                }
            }
        }
        catch (e) {
            g_objAPI = null;
        }
        if (!APIOK()) {
            AlertUserOfAPIError(g_strAPINotFound);
            err = false
        } else {
            err = CallAPI("Initialize", "");
            if (err == "true") {
                SCOInitializeCompletionStatus();
            } else {
                AlertUserOfAPIError(g_strAPIInitFailed)
            }
        }
        if (typeof(SCOInitData) != "undefined") {
            // The SCOInitData function can be defined in another script of the SCO
            SCOInitData()
        }
        g_dtmInitialized = new Date();
    }
    g_bInitDone = true;
    return (err + "") // Force type to string
}
function SCOInitializeCompletionStatus() {
    g_bSCOBrowse = CallAPI("GetValue", g_prop.mode) === "browse";
    if (!g_bSCOBrowse) {
        var completion_status = CallAPI("GetValue", g_prop.completion_status);
        if (completion_status === "not attempted" || completion_status === "unknown") {
            err = CallAPI("SetValue", g_prop.completion_status, "incomplete");
        }
    }
}
function SCOFinish() {
    if ((APIOK()) && (g_bFinishDone == false)) {
        SCOReportSessionTime()
        if (g_bSetCompletedAutomatically){
            SCOSetStatusCompleted();
        }
        if (typeof(SCOSaveData) != "undefined"){
            // The SCOSaveData function can be defined in another script of the SCO
            SCOSaveData();
        }
        if (CallAPI("GetValue", g_prop.exit) === "") {
            // A finished attempt (passed, failed or completed) exits normally so
            // the LMS closes it and can offer a new attempt; anything else is
            // suspended so the learner resumes where they left off (OPENHELP-4259).
            // 1.2 has no "normal": its normal exit is an empty value, set
            // explicitly so the LMS still records that the session ended.
            if (SCOIsAttemptFinal() && !SCOIsOpenElmsRuntime()) {
                CallAPI("SetValue", g_prop.exit, g_ver === "2004" ? "normal" : "");
            } else {
                CallAPI("SetValue", g_prop.exit, "suspend");
            }
        }
        // 2004 also needs a navigation request, or the LMS keeps the player
        // open after Terminate and suspends the attempt when it is closed.
        if (g_ver === "2004" && !SCOIsOpenElmsRuntime() && CallAPI("GetValue", "adl.nav.request") === "_none_") {
            g_bNavRequested = CallAPI("SetValue", "adl.nav.request", SCOIsAttemptFinal() ? "exitAll" : "suspendAll") === "true";
        }
        g_bFinishDone = (CallAPI("Finish", "") === "true");
    }
    return (g_bFinishDone + "" ) // Force type to string
}
// Call these catcher functions rather than trying to call the API adapter directly
function SCOGetValue(nam) {
    var res = "";
    if (APIOK()) {
        res = CallAPI("GetValue", nam.toString());
    }
    return res;
}
function SCOSetValue(nam, val) {
    if (!APIOK()) {
        AlertUserOfAPIError(g_strAPISetError + "\n" + nam + "\n" + val);
        return "false";
    }
    return CallAPI("SetValue", nam, val + "")
}
function SCOSetValue2(nam, val) {
    var err = "";
    if (g_ver === "1.2" && (nam === g_prop.completion_status || nam === g_prop.success_status)) {
        return SCOSetLessonStatus(val);
    }
    if (nam.indexOf(".score.raw") > -1) {
        err = privReportRawScore(val);
    }
    if (err == ""){
        err = SCOSetValue(nam, val);
        if (err != "true") return err;
    }
    if (nam.indexOf(".score.min") > -1){
        g_bMinScoreAcquired = true;
        g_nSCO_ScoreMin = val
    }
    else if (nam.indexOf(".score.max") > -1){
        g_bMaxScoreAcquired = true;
        g_nSCO_ScoreMax = val
    }
    return err;
}
function SCOCommit()					{return ((APIOK())?CallAPI("Commit", ""):"false")}
function SCOGetLastError()		{return ((APIOK())?CallAPI("GetLastError"):"-1")}
function SCOGetErrorString(n)	{return ((APIOK())?CallAPI("GetErrorString", n):"No API")}
function SCOGetDiagnostic(p)	{return ((APIOK())?CallAPI("GetDiagnostic", p):"No API")}
//SetValue is implemented with more complex data
//management logic below
var g_bMinScoreAcquired = false;
var g_bMaxScoreAcquired = false;
function SCOSetTime(prefix, val) {
    var name = "timestamp";
    var date = new Date(String(val).replace(/-/g, "/"));
    var time = date.toISOString().slice(0, -5);
    if (g_ver === "1.2") {
        name = "time";
        time = SCO12Time(date);
    }
    return SCOSetValue(prefix + name, time);
}
function SCO12Time(val) {
    var tempHour = val.getHours();
    var pmsecs = val.getTime();
    var isecs = Math.floor(pmsecs/1000);
    var imins = Math.floor(isecs/60);
    var ihours = Math.floor(imins/60);
    var idays = Math.floor(ihours/24);
    var msecs = String(pmsecs % 1000);
    var secs = String(isecs % 60);
    var mins = String(imins % 60);
    var hours = String(tempHour);
    var days = String(idays);
    while(msecs.length<3) {
        msecs="0" + msecs;
    }
    if(secs.length<2) {
        secs="0" + secs;
    }
    if(mins.length<2) {
        mins="0" + mins;
    }
    if(hours.length<2) {
        hours="0" + hours;
    }
    while(days.length<3) {
        days="0" + days;
    }
    var result="";
    result=hours+":"+mins+":"+secs+"."+msecs;
    result=result.substring(0, result.length - 2);
    return result;
}
function SCO2004Timestamp(val) {
    var regexp = new RegExp("^\\d+:\\d+:\\d+(\\.\\d+)?$");
    if (regexp.test(val)) {
        var arr = val.split(":");
        return "PT"+arr[0]+"H"+arr[1]+"M"+arr[2]+"S";
    }
    return val;
}
function SCOSetLearnerResponse(prefix, val) {
    // strip out "{" and "}" from response
    var re = new RegExp("[{}]","g");
    val = val.replace(re, "");
    if (g_ver === "1.2") {
        var date = new Date();
        var month = (date.getMonth() + 1) + "";
        var day = date.getDate();
        var hours = date.getHours();
        var minutes = date.getMinutes();
        if (month.length == 1) month = "0" + month;
        if (day.length==1) day = "0" + day;
        if (hours.length==1) hours = "0" + hours;
        if (minutes.length==1) minutes = "0" + minutes;
        var dateString = day + "/" + month + "/" + date.getFullYear();
        var timeAndDate = "[" + hours + ":" + minutes + " " + dateString + "]";
        val = timeAndDate + val;
    }
    err = SCOSetData(prefix + "student_response", encodeURIComponent(val));
    if (err == "true") {
        var name = "learner_response";
        if (g_ver === "1.2") {
            name = "student_response";
        }
        else if (g_ver === "2004" && isBoolString(val)) {
            val = (val === "t") + "";
        }
        err = SCOSetValue(prefix + name, val);
    }
    return err;
}
function getGlobalData() {
    var suspendData;
    try {
        suspendData = JSON.parse(SCOGetValue("cmi.suspend_data"));
        if (suspendData === null || typeof suspendData != "object") {
            suspendData = {};
        }
    }
    catch (err) {
        suspendData = {};
    }
    return suspendData;
}
function SCOGetData(name) {
    var parts = name.split(".");
    var element = getGlobalData();
    var i = 0;
    while (i < parts.length) {
        if (element[parts[i]] == null) {
            return null;
        }
        element = element[parts[i]];
        i++;
    }
    return element;
}
function SCOSetData(name, value) {
    var parts = name.split(".");
    var susData = getGlobalData();
    var element = susData;
    var i = 0;
    while (i < parts.length) {
        if (i < (parts.length-1)) {
            if (typeof element[parts[i]] == "undefined") {
                if (isNumeric(parts[i+1])) {
                    element[parts[i]] = [];
                }
                else {
                    element[parts[i]] = {};
                }
            }
        }
        else {
            element[parts[i]] = value;
        }
        element = element[parts[i]];
        i++;
    }
    return SCOSetValue("cmi.suspend_data", JSON.stringify(susData));
}
function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}
function isArray(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
}
function isBoolString(v) {
    return v === "t" || v === "f";
}
function privReportRawScore(nRaw) { // called only by SCOSetValue2
    if (isNaN(nRaw)) return "false";
    if (!g_bMinScoreAcquired){
        if (CallAPI("SetValue", g_prop.score_min, g_nSCO_ScoreMin+"")!= "true") {
            return "false"
        }
    }
    if (!g_bMaxScoreAcquired){
        if (CallAPI("SetValue", g_prop.score_max, g_nSCO_ScoreMax+"")!= "true") {
            return "false"
        }
    }
    if (CallAPI("SetValue", g_prop.score_raw, nRaw)!= "true") {
        return "false";
    }
    if (g_ver === "2004") {
        if (CallAPI("SetValue", g_prop.score_scaled, parseFloat(nRaw) / g_nSCO_ScoreMax) != "true") {
            return "false";
        }
    }
    g_bMinScoreAcquired = false;
    g_bMaxScoreAcquired = false;
    if (!g_bMasteryScoreInitialized){
        var nMasteryScore = parseInt(SCOGetValue("cmi.student_data.mastery_score"),10);
        if (!isNaN(nMasteryScore)) g_SCO_MasteryScore = nMasteryScore;
    }
    if ((g_bInterpretMasteryScore)&&(!isNaN(g_SCO_MasteryScore))){
        var stat = (nRaw >= g_SCO_MasteryScore? "passed" : "failed");
        if (SCOSetValue(g_prop.success_status,stat) != "true") {
            return "false";
        }
    }
    return "true"
}
//Convert duration from milliseconds to 0000:00:00.00 format
function SCO12Duration(ms) {
    var hms = "";
    var dtm = new Date();
    dtm.setTime(ms);
    var h = "000" + Math.floor(ms / 3600000);
    var m = "0" + dtm.getMinutes();
    var s = "0" + dtm.getSeconds();
    var cs = "0" + Math.round(dtm.getMilliseconds() / 10);
    hms = h.substr(h.length-4);
    hms += ":"+m.substr(m.length-2);
    hms += ":"+s.substr(s.length-2);
    hms += "."+cs.substr(cs.length-2);
    return hms;
}

// SCOReportSessionTime is called automatically by this script,
// but you may call it at any time also from the SCO
function SCOReportSessionTime() {
    var date = new Date();
    var sessionMs = date.getTime() - g_dtmInitialized.getTime();
    return SCOSetValue(g_prop.session_time, normalizeDuration(SCO12Duration(sessionMs)));
}
// Since only the designer of a SCO knows what completed means, another
// script of the SCO may call this function to set completed status.
// The function checks that the SCO is not in browse mode, and
// avoids clobbering a "passed" or "failed" status since they imply "completed".
function SCOSetStatusCompleted(){
    var completion_stat = SCOGetValue(g_prop.completion_status);
    var success_stat = SCOGetValue(g_prop.success_status);
    if (SCOGetValue(g_prop.mode) != "browse"){
        if ((completion_stat!="completed") && (success_stat != "passed") && (success_stat != "failed")){
            return SCOSetValue(g_prop.completion_status, "completed")
        }
    } else {
        return "false";
    }
}
// The SCORM 1.2 style lesson status, also for a 2004 LMS (whose data model
// splits it into completion and success): passed/failed win over completion.
function SCOGetLessonStatus() {
    if (g_ver === "1.2") {
        return SCOGetValue(g_prop.completion_status);
    }
    var success_stat = SCOGetValue(g_prop.success_status);
    if (success_stat === "passed" || success_stat === "failed") {
        return success_stat;
    }
    return SCOGetValue(g_prop.completion_status);
}
// Whether the attempt has its final result (passed, failed or completed).
function SCOIsAttemptFinal() {
    return ["passed", "failed", "completed"].indexOf(SCOGetLessonStatus()) > -1;
}
function SCOSetLessonStatus(status) {
    status = normalizeStatus(status);
    if (g_ver === "1.2") {
        return SCOSetValue(g_prop.completion_status, status);
    }
    else {
        if (["failed", "passed"].indexOf(status) > -1) {
            // Passed and failed are both a finished attempt: a failed one
            // left "incomplete" can never be retaken (OPENHELP-4259).
            if (!g_bSCOBrowse && SCOGetValue(g_prop.completion_status) !== "completed") {
                SCOSetValue(g_prop.completion_status, "completed");
            }
            return SCOSetValue(g_prop.success_status, status);
        }
        else {
            return SCOSetValue(g_prop.completion_status, status);
        }
    }
}
// Objective management logic
function SCOSetObjectiveData(id, elem, v) {
    var result = "false";
    var i = SCOGetObjectiveIndex(id);
    if (isNaN(i)) {
        i = parseInt(SCOGetValue("cmi.objectives._count"));
        if (isNaN(i)) i = 0;
        if (SCOSetValue("cmi.objectives." + i + ".id", id) == "true"){
            result = SCOSetValue2("cmi.objectives." + i + "." + elem, v)
        }
    } else {
        result = SCOSetValue2("cmi.objectives." + i + "." + elem, v);
        if (result != "true") {
            // Maybe this LMS accepts only journaling entries
            i = parseInt(SCOGetValue("cmi.objectives._count"));
            if (!isNaN(i)) {
                if (SCOSetValue("cmi.objectives." + i + ".id", id) == "true"){
                    result = SCOSetValue2("cmi.objectives." + i + "." + elem, v)
                }
            }
        }
    }
    return result
}
function SCOGetObjectiveData(id, elem) {
    var i = SCOGetObjectiveIndex(id);
    if (!isNaN(i)) {
        return SCOGetValue("cmi.objectives." + i + "."+elem)
    }
    return ""
}
function SCOGetObjectiveIndex(id){
    var i = -1;
    var nCount = parseInt(SCOGetValue("cmi.objectives._count"));
    if (!isNaN(nCount)) {
        for (i = nCount-1; i >= 0; i--){ //walk backward in case LMS does journaling
            if (SCOGetValue("cmi.objectives." + i + ".id") == id) {
                return i
            }
        }
    }
    return NaN
}
// Functions to convert AICC compatible tokens or abbreviations to SCORM tokens
function AICCTokenToSCORMToken(strList,strTest){
    var a = strList.split(",");
    var c = strTest.substr(0,1).toLowerCase();
    for (i=0;i<a.length;i++){
        if (c == a[i].substr(0,1)) return a[i]
    }
    return strTest
}
function normalizeStatus(status){
    return AICCTokenToSCORMToken("completed,incomplete,not attempted,failed,passed", status)
}
function normalizeInteractionType(theType){
    return AICCTokenToSCORMToken("true-false,choice,fill-in,matching,performance,sequencing,likert,numeric", theType)
}
function normalizeInteractionPattern(pat) {
    // strip out "{" and "}" from response
    // todo: check if this is even necessary
    var re = new RegExp("[{}]","g");
    pat = pat.replace(re, "");
    if (g_ver === "2004" && isBoolString(pat)) {
        pat = (pat === "t") + "";
    }
    return pat;
}
function normalizeInteractionResult(result){
    var result = AICCTokenToSCORMToken("correct,wrong,unanticipated,neutral", result);
    if (g_ver === "2004" && result === "wrong") {
        result = "incorrect";
    }
    return result;
}
function normalizeDuration(ts) {
    if (g_ver === "2004") {
        ts = SCO2004Timestamp(ts);
    }
    return ts;
}
function translate12Prop(prop) {
    return typeof g_keys12[prop] === "string" ? g_prop[g_keys12[prop]] : prop;
}
// Detect Internet Explorer
var g_isIE = navigator.appName.indexOf("Microsoft") != -1;
// Handle fscommand messages from a Flash movie, remapping
// any AICC Flash template commands to SCORM if necessary
function training20_DoFSCommand(command, args){
    // no-op if no SCORM API is available
    var myArgs = ((typeof args === "number" ? args.toString() : args) || "").toString();
    var cmd = command || "";
    var v = "";
    var err = "true";
    var arg1, arg2, n, s, i;
    var sep = myArgs.indexOf(",");
    if (sep > -1){
        arg1 = myArgs.substr(0, sep); // Name of data element to get from API
        arg2 = myArgs.substr(sep+1); 	// Name of Flash movie variable to set
    } else {
        arg1 = myArgs
    }

    if (!APIOK()) return;
    if (cmd.substring(0,3) === "LMS"){
        // Handle "LMSxxx" FScommands (compatible with fsSCORM html template)
        if ( cmd === "LMSInitialize" ) {
            err = (APIOK() + "");
            // The actual LMSInitialize is called automatically by the template
        } else if ( cmd === "LMSSetValue" ) {
            err = SCOSetValue2(translate12Prop(arg1), arg2);
        } else if (cmd === "LMSSetData") {
            err = SCOSetData(arg1, arg2)
        } else if ( cmd === "LMSFinish" ){
            err = SCOFinish()
        } else if ( cmd === "LMSCommit" ){
            err = SCOCommit()
        } else if (cmd.substring(0,6) === "LMSGet") {
            // err = "-2: No Flash variable specified"
            if (cmd === "LMSGetData") {
                return SCOGetData(arg1);
            }
            if (arg1 === "cmi.core.lesson_status") {
                return SCOGetLessonStatus();
            }
            return SCOGetValue(translate12Prop(arg1));
        }
        // end of handling "LMSxxx" cmds
    } else if ((cmd.substring(0,6) === "MM_cmi")||(cmd.substring(0,6) === "CMISet")) {
        // Handle a Macromedia Learning Components FScommands.
        // These are using AICC HACP data model conventions,
        // so remap data from AICC to SCORM as necessary.
        var F_intData = myArgs.split(";");
        if (cmd === "MM_cmiSendInteractionInfo") {
            n = SCOGetValue("cmi.interactions._count");
            if (!n) {
                n = 0;
            }
            s = "cmi.interactions." + n + ".";
            // Catch gross errors to avoid SCORM compliance test failure
            // If no ID is provided for this interaction, we cannot record it
            v = F_intData[2];
            if ((v == null) || (v == "")) {
                err = 201; // If no ID, makes no sense to record
            }
            //check if the id of interactions exist. If exists then exit as set var err to ""
            if (err == "true") {
                for (var currSeqNum=0;currSeqNum<n; currSeqNum++) {
                    if (SCOGetValue("cmi.interactions." + currSeqNum + ".id") == v) {
                        err = "true";
                        s = "cmi.interactions." + currSeqNum + ".";
                        SCOSetValue("cmi.interactions._count", n-1);
                        break;
                    }
                }
            }
            if (err === "true") {
                err = SCOSetValue(s + "id", v);
            }
            if (err === "true") {
                err = SCOSetData(s + "id", v);
            }
            // if (err === "true") {
            //     err = SCOSetValue(s + "objectives.0.id", "null");
            // }
            if (err == "true") {
                for (i=1; (i<=9) && (err=="true"); i++){
                    v = decodeURIComponent(F_intData[i]);
                    if ((v == null) || (v == "")) {
                        continue;
                    }
                    if (i == 1) {
                        err = SCOSetTime(s, v);
                    }
                    else if (i == 3) {
                        SCOSetValue(s + "description", v);
                    }
                    else if (i == 4) {
                        err = SCOSetValue(s + "type", normalizeInteractionType(v));
                        err = SCOSetData(s + "type", normalizeInteractionType(v));
                    }
                    else if (i == 5) {
                        err = SCOSetValue(s + "correct_responses.0.pattern", normalizeInteractionPattern(v));
                    }
                    else if (i == 6) {
                        err = SCOSetLearnerResponse(s, v);
                    }
                    else if (i == 7) {
                        err = SCOSetValue(s + "result", normalizeInteractionResult(v));
                        err = SCOSetData(s + "result", normalizeInteractionResult(v));
                    }
                    else if (i == 8) {
                        err = SCOSetValue(s + "weighting", v);
                    }
                    else if (i == 9) {
                        err = SCOSetValue(s + "latency", normalizeDuration(v));
                        err = SCOSetData(s + "latency", normalizeDuration(v));
                    }
                }
            }
        } else if (cmd === "MM_cmiGetInteractions") {
            var interactions = SCOGetData("cmi.interactions");
            if (isArray(interactions)) {
                n = interactions.length;
                return interactions;
            }
            return [];
        } else if (cmd === "MM_cmiGetInteractionInfo") {
            var interactions = SCOGetData("cmi.interactions");
            if (isArray(interactions)) {
                n = interactions.length;
            }
            else {
                n = 0;
            }
            v = arg1;
            for (var currSeqNum=0;currSeqNum<n; currSeqNum++) {
                if (SCOGetData("cmi.interactions." + currSeqNum + ".id") == v){
                    return SCOGetData("cmi.interactions." + currSeqNum + ".student_response");
                }
            }
            return "";
        } else if (cmd === "MM_cmiSendObjectiveInfo"){
            err = SCOSetObjectiveData(F_intData[1], ".score.raw", F_intData[2]);
            if (err=="true"){
                SCOSetObjectiveData(F_intData[1], ".status", normalizeStatus(F_intData[3]))
            }
        } else if ((cmd==="CMISetScore") ||(cmd === "MM_cmiSendScore")){
            err = SCOSetValue2(g_prop.score_raw, F_intData[0]);
        } else if ((cmd==="CMISetStatus") || (cmd === "MM_cmiSetLessonStatus")){
            err = SCOSetLessonStatus(F_intData[0]);
        } else if (cmd==="CMISetTime"){
            err = SCOSetValue(g_prop.session_time, F_intData[0])
        } else if (cmd==="CMISetCompleted"){
            err = SCOSetStatusCompleted()
        } else if (cmd==="CMISetStarted") {
            err = SCOSetValue(g_prop.completion_status, "incomplete")
        } else if (cmd==="CMISetPassed"){
            err = SCOSetValue(g_prop.success_status, "passed")
        } else if (cmd==="CMISetFailed"){
            err = SCOSetValue(g_prop.success_status, "failed")
        } else if (cmd==="CMISetData"){
            // todo: value should be stringified JSON
            err = SCOSetValue("cmi.suspend_data", F_intData[0])
        } else if (cmd==="CMISetLocation"){
            err = SCOSetValue(g_prop.location, F_intData[0])
        } else if (cmd==="CMISetTimedOut"){
            err = SCOSetValue(g_prop.exit, "time-out")
        } // Other Learning Component FScommands are no-ops in this context
    }
    else {
        if (cmd==="CMIFinish" || cmd==="CMIExitAU"){
            err = SCOFinish()
        } else if (cmd==="CMIInitialize" || cmd==="MM_StartSession"){
            err = SCOInitialize()
        } else if (cmd === "callParent") {
            try {
                var fn = arg1;
                if (top[fn]) {
                    try {
                        top[fn](arg2);
                    }
                    catch (err) {
                        parent[fn](arg2);
                    }
                }
                else if (parent[fn]) {
                    parent[fn](arg2);
                }
                else {
                    if (fn === "submitAssessment") {
                        if (parent.closeIframeInline) {
                            parent.closeIframeInline();
                        }
                        window.close();
                    }
                }
            } catch(err) {
                console.error(err);
            }
        }
        else {
            // Unknown command; may be invoking an API extension
            // If commands comes with a 2nd argument, assume a value is expected
            // otherwise assume it is just a cmd
            try {
                if (typeof g_objAPI[GetAPIMethod(cmd)] === "function") {
                    v = CallAPI(cmd, arg1);
                    err = v + "";
                } else {
                    err = "false";
                }
            } catch(err) {
                console.error(err);
            }
        }
    }
    // End of command translation and processing
    // handle detected errors, such LMS error returns
    if ((g_bShowApiErrors) && (err != "true")) {
        AlertUserOfAPIError(ExpandString(g_strFSAPIError, err, cmd, args))
    }
    return err
}
function closeRoom() {
    // A 2004 LMS that got a navigation request closes the player itself.
    // Closing the window at the same time races it, and SCORM Cloud then
    // keeps the finished attempt's data (OPENHELP-4259); an LMS that ignores
    // the request (Open eLMS) still gets its window closed a moment later.
    if (g_bNavRequested) {
        setTimeout(closeRoomNow, 1500);
        return;
    }
    closeRoomNow();
}
function closeRoomNow() {
    try {
        if (
            parent &&
            parent.parent &&
            parent.parent.closeIframeInline
        ) {
            parent.parent.closeIframeInline();
        } else {
            closeWin();
        }
    }
    catch (e) {
        closeWin();
    }
}
function closeWin() {
    top.window.postMessage({type: "APPClose"}, "*");
    if (!top.window.cordova) {
        top.window.close();
    }
}
function openHtml(html, windowName, windowSettings) {
    var win = window.open("", windowName, windowSettings);
    win.document.write(html);
}

// Will save data, then close player
window.onmessage = function(e){
    if (e.data == 'close-player') {
        SCOFinish();
        closeRoom();
    }
};