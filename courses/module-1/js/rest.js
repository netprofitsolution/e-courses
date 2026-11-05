function callRest(url, method, data, callback) {
    method = (method || "GET").toUpperCase();
    data = (data || null);
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open(method, url, true);
    if (callback) {
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState === XMLHttpRequest.DONE) {
                callback(xmlhttp.responseText)
            }
        };
    }
    if (method === 'POST') {
        xmlhttp.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    }
    xmlhttp.send(typeof data === "string" ? data : encodeObject(data));
}

function encodeObject(object) {
    var encodedString = '';
    for (var prop in object) {
        if (object.hasOwnProperty(prop)) {
            if (encodedString.length > 0) {
                encodedString += '&';
            }
            encodedString += encodeURI(prop + '=' + object[prop]);
        }
    }
    return encodedString;
}