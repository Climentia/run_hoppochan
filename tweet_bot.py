import tweepy
import os
import shutil
import datetime
import command_code
import calculation
import distance_cal
import street_view_for
import GIF_MAKER
import map_getter
import place_name
import time
import schedule
place_path = "./data/place_log.csv"
twee_path = "./data/twee_log.txt"


def reading_block():
    with open("./key/twitter_key.txt", "r") as fr:
        tw_lists = fr.readlines()
        consumer_key = tw_lists[1]
        consumer_secret = tw_lists[2]
        access_token_key = tw_lists[3]
        access_token_secret = tw_lists[4]
        Twitter_ID = tw_lists[5]
    auth = tweepy.OAuthHandler(consumer_key, consumer_secret)
    auth.set_access_token(access_token_key, access_token_secret)
    api = tweepy.API(auth)
    tweets = api.user_timeline(Twitter_ID, count=10, page=1, timeout=55)
    nino_list = []
    date = datetime.datetime.now()
    H = date.hour
    DD = date.minute
    print("------------" + str(H) + ":" + str(DD) + "------------")
    for tweet in tweets:
        a = tweet.text.split("\n")
        tw_ti = tweet.created_at
        ts = date - tw_ti
        user = a[0]
        if ts.total_seconds()-32400 <= 2400:
            nino_list.append(user)
    for status in api.mentions_timeline(count=3, tweet_mode='extended', timeout=55):
        # ユーザ名表示
        user = status.user.screen_name
        username = "@" + user
        status_id = status.id
        zikan = status.created_at
        # tweetテキスト読み込み
        txt0 = status.full_text
        td = date - zikan
        if td.total_seconds()-32400 <= 2400:
            print("------------reading txt------------")
            print("user   : " + username)
            print("time   : " + str(zikan))
            print(txt0)
            print("------------status------------")
            print("--------------------------------------")
            user_flag = 0
            for nino_user in nino_list:
                if nino_user == username:
                    user_flag = 1
            if user_flag == 0:
                if "comm" in txt0:
                    txt = command_code.dict(txt0, username)
                else:
                    txt2 = calculation.dict(txt0, username)
                    if "," in txt2:
                        print(txt2)
                        txt_list = txt2.split(",")
                        total = txt_list[0]
                        day = txt_list[1]
                        with open(place_path, "r", encoding="utf-8") as fr_p_log:
                            lists = fr_p_log.readlines()
                            destination_list = lists[1].split(",")
                            destination = destination_list[1]
                            distance_list = lists[2].split(",")
                            distance = distance_list[1]
                            kyori_total_list = lists[7].split(",")
                            kyori_total = kyori_total_list[1]
                        twee_ch = os.path.exists(twee_path)
                        if twee_ch == False:
                            with open(twee_path, "w") as fmake:
                                fmake.write(str(0))
                        with open(twee_path, "r") as fr_t_log:
                            tw_day = float(fr_t_log.readline())
                        tw_day += float(day)
                        nokori = round(float(distance) - (float(kyori_total) + float(tw_day)), 2)
                        # kouken = round(float(total)/float(tw_day), 2)
                        txt_kozin = "あなたは今日ほっぽちゃんを" + str(day) + "km進めました!トータルではあなたは" + str(total) + "km進めています!\n"
                        txt_zentai = str(destination).strip("\n") + "まで残り" + str(round(float(nokori)/1000, 2)) + "kmです！"
                        txt = txt_kozin + txt_zentai
                        with open(twee_path, "w") as fw_t_log:
                            fw_t_log.write(str(tw_day))
                    else:
                        txt = txt2
                    txt2 = str(txt)
                    txt = username + "\n" + txt
                    print("------------post txt------------")
                    print("user   : @Climentia_nino")
                    print(username + "\n" + txt)
                    api.update_status(status=txt, in_reply_to_status_id=status_id)
                    print("------------status------------")
            else:
                print("Locked!")


def loading_block():
    # list = glob.glob("log/*")\
    with open("./key/twitter_key.txt", "r") as fr:
        tw_lists = fr.readlines()
        consumer_key = tw_lists[1]
        consumer_secret = tw_lists[2]
        access_token_key = tw_lists[3]
        access_token_secret = tw_lists[4]
    auth = tweepy.OAuthHandler(consumer_key, consumer_secret)
    auth.set_access_token(access_token_key, access_token_secret)
    api = tweepy.API(auth)
    twee_exist = os.path.exists(twee_path)
    place_exist = os.path.exists(place_path)
    if place_exist == True:
        if twee_exist == True:
            with open(twee_path, "r", encoding="utf-8") as fr:
                tw_day = str(fr.readline())
            with open(twee_path, "w", encoding="utf-8") as fw_i:
                fw_i.write(str(0))
            if tw_day != "0":
                ds_flag = distance_cal.distance(tw_day)
                st_flag = street_view_for.streetview()
                gif_flag = GIF_MAKER.GIF_MAKE()
                map_flag = map_getter.map_make()
                if "error" in str(ds_flag) or "error" in str(st_flag) or "error" in str(gif_flag) or "error" in str(map_flag):
                    txt = "error:処理が正常に行われませんでした。"
                    print("------------post txt------------")
                    print("user   : @Climentia_nino")
                    print(txt)
                    print("------------status------------")
                elif ds_flag == "finish":
                    os.remove("place_log.csv")
                    txt = "おめでとうございます!ゴールしました!\n次の目的地を入力してください!"
                    print("------------post txt------------")
                    print("user   : @Climentia_nino")
                    print(txt)
                    print("------------status------------")
                    pic_name = "./data/route_map.png"
                    api.update_with_media(filename=pic_name, status=txt)
                    shutil.rmtree("./rireki")
                    os.mkdir("./rireki")
                else:
                    map_flag.split(",")
                    lat_now = map_flag[0]
                    lng_now = map_flag[1]
                    name = place_name.place_name(lat_now, lng_now)
                    with open(place_path, "r", encoding="utf-8") as fr_p_log:
                        lists = fr_p_log.readlines()
                        destination_list = lists[1].split(",")
                        destination = destination_list[1]
                        distance_list = lists[2].split(",")
                        distance = distance_list[1]
                        kyori_total_list = lists[7].split(",")
                        kyori_total = kyori_total_list[1]
                    # api.update_with_media(filename=pic_name, status=tweet)
                    file_names = ["./data/route.gif"]
                    media_ids = []
                    for filename in file_names:
                        res = api.media_upload(filename)
                        media_ids.append(res.media_id)
                    # tweet with multiple images
                    nokori = float(distance) - float(kyori_total)
                    pas = (float(kyori_total) / float(distance))*100
                    twee_txt = "ほっぽちゃんは今" + str(name) + "にいます!\n" + str(destination).strip("\n") +"までの残り距離はおよそ" + str(round(nokori/1000, 2)) + "kmでコースの" + str(round(pas, 2)) + "%走りました!"
                    print("------------post txt------------")
                    print("user   : @Climentia_nino")
                    print("text   : "+twee_txt)
                    print("------------status------------")
                    api.update_status(status=twee_txt, media_ids=media_ids)
                    tweet = "ほっぽちゃんの現在位置です!"
                    pic_name = "./data/route_map.png"
                    api.update_with_media(filename=pic_name, status=tweet)
        else:
            print("------------post txt------------")
            print("user   : @Climentia_nino")
            print("text   : "+txt)
            print("------------status------------")
            txt = "error:ほっぽちゃんの進んだ距離が分かりません。"
            pic_name = "./street_view/noplace.jpg"
            api.update_with_media(filename=pic_name, status=txt)
    else:
        txt = "error:ほっぽちゃんの行き先が決まっていません"
        pic_name = "./street_view/noplace.jpg"
        print("------------post txt------------")
        print("user   : @Climentia_nino")
        print("text   : "+txt)
        print("------------status------------")
        api.update_with_media(filename=pic_name, status=txt)


def read_main():
    try:
        reading_block()
    except Exception as e:
        print("error:" + str(e))


schedule.every().day.at("22:00").do(loading_block)
schedule.every(1).minutes.do(read_main)

while True:
    schedule.run_pending()
    time.sleep(1)
