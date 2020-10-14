import googlemaps
import requests
import json


def convert():
    json_open = open("./data/place_name.json", "r", encoding="utf-8")
    json_load = json.load(json_open)
    route_line = json_load['results'][0]['formatted_address']
    print(str(route_line))
    return route_line


def place_name(lat, lng):
    with open("./key/google_key.txt", "r") as fr:
        MY_API_KEY = fr.readline()
    URL_FORMAT = "https://maps.googleapis.com/maps/api/geocode/json?latlng={}2&key={}"
    key = "{}".format(MY_API_KEY)
    latlng = "{},{}".format(lat, lng)
    url = URL_FORMAT.format(latlng, key)
    print(url)
    res = requests.get(url)
    file_name = "./data/place_name.json"
    with open(file_name, "wb") as f:
        f.write(res.content)
    name = convert()
    return(name)
