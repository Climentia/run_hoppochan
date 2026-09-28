import requests
import json


def convert():
    json_open = open("./data/route_latlon.json", "r", encoding="utf-8")
    json_load = json.load(json_open)
    route_line = json_load['routes'][0]["overview_polyline"]["points"]
    return route_line


def map_make():
    try:
        with open("./data/place_log.csv", "r") as fr:
            b_lists = fr.readlines()
            lists = []
            for line in b_lists:
                line = line.split(",")
                lists.append(line)
            lat_now = lists[8][1]
            lng_now = lists[9][1]
        with open("./key/google_key.txt", "r") as fr:
            MY_API_KEY = fr.readline()
        URL_FORMAT = "https://maps.googleapis.com/maps/api/staticmap?key={}&size={}&zoom=8&format={}&maptype={}&markers={}&path={}"
        tate = 640
        yoko = 480
        # origin = "{},{}".format(lat_start, lng_start)
        # destination = "{},{}".format(lat_end, lng_end)
        key = "{}".format(MY_API_KEY)
        size = "{}x{}".format(tate, yoko)
        format = "{}".format("png")
        maptype = "{}".format("roadmap")
        # print(str(lat_now))
        # print(str(lng_now))
        marker_txt = "size:mid|color:blue|label:H|" + lat_now + "," + lng_now
        markers = "{}".format(marker_txt)
        lonlatlist = convert()
        # print(lonlatlist)
        # path_txt = "fillcolor:0xAA000033%7|Ccolor:0xFFFFFF00%7|enc:" + lonlatlist
        path_txt = "weight:3%7Ccolor:red%7Cenc:" + lonlatlist
        path = "{}".format(path_txt)
        url = URL_FORMAT.format(key, size, format, maptype, markers, path)
        filename = "./data/route_map"
        file_name = "{}.{}".format(filename, "png")
        res = requests.get(url)
        if res.status_code == 200:
            with open(file_name, "wb") as f:
                f.write(res.content)
        r_txt = str(lat_now) + "," + str(lng_now)
        return r_txt
    except Exception as e:
        txt = "error:" + str(e)
        print(txt)
        return txt
