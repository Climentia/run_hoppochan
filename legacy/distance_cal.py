import math


def distance(tw_day):
    kyori_twitter = round(float(tw_day))*1000
    divide_log_lists = []
    flag = 0
    Re = 6378.127
    lat_distance_1 = 110.94297
    pi = 3.14159
    kyori_today = 0
    distance = 0
    with open("./data/place_log.csv", "r") as frlog:
        log_lists = frlog.readlines()
        for log_line in log_lists:
            log_list = log_line.split(",")
            divide_log_lists.append(log_list)
    kyori_total = round(float(divide_log_lists[7][1]), 2)
    # print("kyori_total_old:" + str(kyori_total))
    lat_now = divide_log_lists[8][1]
    lng_now = divide_log_lists[9][1]
    with open("./data/route_point_interpolation.csv") as fr:
        with open("./data/streetview_palce.csv", "w") as fws:
            place_lists = fr.readlines()
            lon_distance_1 = (2 * pi * Re * math.cos(math.radians(float(lat_now))))/360
            print("lon_dis_1:"+  str(lon_distance_1))
            count = 1
            # print(lon_distance_1)
            for line_num in range(len(place_lists)-1):
                # print(str(line_num))
                place_list_before = place_lists[line_num].split(",")
                lat_before = place_list_before[0]
                lng_before = place_list_before[1]
                place_list_after = place_lists[line_num+1].split(",")
                lat_after = place_list_after[0]
                lng_after = place_list_after[1]
                # print("---" + lat_after + lng_after + "---")
                # 現在地と一致した場所を見つける
                # print("---" + str(int(float(lat_after)*100000)) + "," + str(int(float(lng_after)*100000)) + "---")
                # print("---" + str(int(float(lat_end)*100000)) + "," + str(int(float(lng_end)*100000)) + "---")
            #     print("-------------------------")
                if int(float(lat_now)*100000) == int(float(lat_before)*100000) and int(float(lng_now)*100000) == int(float(lng_before)*100000):
                    flag = 1
                # 見つかっていたら距離を求めてファイルに書き込んでいく
                if flag == 1:
                    # print("---" + lat_after + lng_after + "---")
                    lat_diff = float(lat_after) - float(lat_before)
                    lon_diff = float(lng_after) - float(lng_before)
                    lat_diff = round(lat_diff, 5)
                    lon_diff = round(lon_diff, 5)
                    distance = ((lat_diff*lat_distance_1)**2 + (lon_diff*lon_distance_1)**2)**(0.5)
                    # print(str(distance))
                    kyori_today = kyori_today + (distance*1000)
                    # print(kyori_today)
                    # print(kyori_twitter)
                    txt_w = str(lat_before) + "," + str(lng_before) + "," + "\n"
                    fws.write(txt_w)
                    # print(kyori_today)
                    # print(kyori_twitter)
                    if float(kyori_today) >= float(kyori_twitter):
                        break
                # print(len(place_lists)-1)
                # print(count)
                if count == len(place_lists)-1:
                    flag = 2
                    txt_w = str(lat_after) + "," + str(lng_after) + "," + "\n"
                    break
                count += 1
            # print(flag)
        # print(kyori_total)
        # print(kyori_today)
        # print(str(flag))
        # print(str(kyori_total))
        kyori_total = kyori_total + kyori_today
        place_list_before = place_lists[count].split(",")
        lat_now = place_list_before[0]
        lng_now = place_list_before[1]
        # print("kakikomi;" + lat_now + lng_now)
    if flag == 2:
        # os.remove("place_log.csv")
        txt_r = "finish"
        return txt_r
    else:
        with open("./data/place_log.csv", "w", encoding="utf-8") as fw1:
            for i in range(7):
                fw1.write(log_lists[i])
            # print("kyori_total_new:" + str(kyori_total))
            new_txt1 = "kyori_total" + "," + str(round(float(kyori_total) ,2)) + "\n"
            new_txt2 = "lat_now" + "," + place_list_before[0] + "\n"
            new_txt3 = "lng_now" + "," + place_list_before[1] + "\n"
            fw1.write(new_txt1)
            fw1.write(new_txt2)
            fw1.write(new_txt3)
            return "ok"


# distance(3)
