import requests
import json
import polyline
import math


def keiro(origin_in, destination_in):
    try:
        with open("./key/google_key.txt", "r") as fr:
            MY_API_KEY = fr.readline()
        URL_FORMAT = "https://maps.googleapis.com/maps/api/directions/json?origin={}&destination={}&mode={}&key={}"

        origin = "{}".format(origin_in)
        destination = "{}".format(destination_in)
        key = "{}".format(MY_API_KEY)
        mode = "{}".format("DRIVING")
        url = URL_FORMAT.format(origin, destination, mode, key)
        # print("url:" + url)
        filename = "./data/route_latlon"
        file_name = "{}.{}".format(filename, "json")
        res = requests.get(url)
        if res.status_code == 200:
            with open(file_name, "wb") as f:
                f.write(res.content)
        convert_txt = convert_json_to_csv()
        address = get_data()
        convert_list = convert_txt.split(",")
        address_list = address.split(",")
        with open("./data/place_log.csv", "w", encoding="utf-8") as fwlog:
            txt0 = "origin" + "," + str(address_list[0]) + "\n"
            txt1 = "destination" + "," + str(address_list[1]) + "," + "\n"
            txt2 = "distance" + "," + str(convert_list[4]) + "," + "\n"
            txt3 = "lat_start" + "," + str(convert_list[0]) + "," + "\n"
            txt4 = "lng_start" + "," + str(convert_list[1]) + "," + "\n"
            txt5 = "lat_end" + "," + str(convert_list[2]) + "," + "\n"
            txt6 = "lng_end" + "," + str(convert_list[3]) + "," + "\n"
            txt7 = "kyori_total" + "," + str("0") + "," + "\n"
            txt8 = "lat_now" + "," + str(round(float(convert_list[0]), 5)) + "," + "\n"
            txt9 = "lng_now" + "," + str(round(float(convert_list[1]), 5)) + "," + "\n"
            fwlog.write(txt0)
            fwlog.write(txt1)
            fwlog.write(txt2)
            fwlog.write(txt3)
            fwlog.write(txt4)
            fwlog.write(txt5)
            fwlog.write(txt6)
            fwlog.write(txt7)
            fwlog.write(txt8)
            fwlog.write(txt9)
        interpolation()
        return 0
    except Exception as e:
        txt = "error:" + str(e)
        print("keiro.py:" + txt)
        return txt
        raise


def convert_json_to_csv():
    json_open = open("./data/route_latlon.json", "r")
    json_load = json.load(json_open)
    route_distance = json_load['routes'][0]["legs"][0]["distance"]["value"]
    lat_start = json_load['routes'][0]["legs"][0]["start_location"]["lat"]
    lng_start = json_load['routes'][0]["legs"][0]["start_location"]["lng"]
    lat_end = json_load['routes'][0]["legs"][0]["end_location"]["lat"]
    lng_end = json_load['routes'][0]["legs"][0]["end_location"]["lng"]
    route_line = json_load['routes'][0]["overview_polyline"]["points"]
    lonlatlist = polyline.decode(route_line)
    retun_txt = str(lat_start) + "," + str(lng_start) + "," + str(lat_end) + "," + str(lng_end) + "," + str(route_distance)
    with open("./data/route_point.csv", "w") as fw:
        for lonlat in lonlatlist:
            lat = str(round(lonlat[0], 5))
            lon = str(round(lonlat[1], 5))
            txt = lat + "," + lon + "," + "\n"
            fw.write(txt)
    return retun_txt


def get_data():
    json_open = open("./data/route_latlon.json", "r")
    json_load = json.load(json_open)
    start_address_list = json_load['routes'][0]["legs"][0]["start_address"].split(",")
    end_address_list = json_load['routes'][0]["legs"][0]["end_address"].split(",")
    address = start_address_list[0] + "," + end_address_list[0]
    print(address)
    return address


def interpolation():
    with open("./data/route_point.csv", "r", encoding="utf-8") as fr:
        with open("./data/route_point_interpolation.csv", "w", encoding="utf-8") as fw:
            lists = fr.readlines()
            bunkatu_kyori = 50
            Re = 6378.127
            lat_distance_1 = 110.94297
            pi = 3.14159
            divide_lists = []
            for line in lists:
                list = line.split(",")
                divide_lists.append(list)
            lon_distance_1 = 2 * pi * Re * math.cos(pi/180*float(divide_lists[0][0]))*1/360
            print("lon_distance_1:" + str(lon_distance_1))
            # print(lon_distance_1)
            for i in range(len(divide_lists)-1):
                # for i in range(3):
                # print("lat:" + divide_lists[i][0])
                # print("lon:" + divide_lists[i][1])
                lat_diff = float(divide_lists[i+1][0]) - float(divide_lists[i][0])
                lon_diff = float(divide_lists[i+1][1]) - float(divide_lists[i][1])
                lat_diff = round(lat_diff, 5)
                lon_diff = round(lon_diff, 5)
                # print("lat_diff:" + str(lat_diff))
                # print("lon_diff:" + str(lon_diff))
                distance = (((lat_diff*lat_distance_1)**2 + (lon_diff*lon_distance_1)**2)**(1/2)) * 1000
                # print(distance)
                bunkatu_suu = int(distance/bunkatu_kyori)
                # print("bunkatu_suu:" + str(bunkatu_suu))
                if bunkatu_suu == 0:
                    txt = str(round(float(divide_lists[i][0]), 5)) + "," + str(round(float(divide_lists[i][1]), 5)) + "," + "\n"
                    fw.write(txt)
                else:
                    for num in range(bunkatu_suu):
                        lat = (float(divide_lists[i][0]) + num * lat_diff/bunkatu_suu)
                        lon = (float(divide_lists[i][1]) + num * lon_diff/bunkatu_suu)
                        txt = str(round(lat, 5)) + "," + str(round(lon, 5)) + "," + "\n"
                        fw.write(txt)


# convert_json_to_csv()
# get_data()
# keiro("ローマ", "オスティア")
