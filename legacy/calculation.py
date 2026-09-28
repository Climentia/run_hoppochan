import re
import os
import data_setting


def dict(txt, username):
    # try:
    cal_sum = 0
    list0 = txt.split("\n")
    list = []
    if ":" in txt:
        for i in range(len(list0)):
            if ":" in list0[i] or "：" in list0[i]:
                line = list0[i].split(":")
                list.append(line)
        for split_list in list:
            id = split_list[0]
            value = split_list[1]
            cal = calorie(id, value)
            if cal != "error":
                cal_sum += round(cal, 2)
            else:
                cal_sum = "error_block_dict"
        over_cheack = 0
        check = type(cal_sum) is str
        if check == True:
            new = "error_block_dict"
            a = "error:入力が正しい形式ではありません。仕様を確認してもう一度リプライをお願いします。"
            return str(a)
        else:
            km_sum = cal_sum/40.89
            if km_sum > 15:
                km_sum = 15
                over_cheack = 1
            ex = os.path.exists("rireki/" + username + "_point.txt")
            if ex == False:
                with open("rireki/" + username + "_point.txt", "w", encoding="utf-8") as fw:
                    fw.write("")
            with open("rireki/" + username + "_point.txt", "r", encoding="utf-8") as fr:
                gokei = fr.readline()
            with open("rireki/" + username + "_point.txt", "w", encoding="utf-8") as fw:
                if gokei == "":
                    gokei = "0"
                gokei = round(float(gokei), 2)
                gokei += km_sum
                fw.write(str(gokei))
                new = str(round(gokei, 2)) + "," + str(round(km_sum, 2)) + "," + str(round(over_cheack))
                return str(new)
    elif "：" in txt:
        txt = "error:全角文字が含まれています。半角でtweetし直してください。"
        return str(txt)
    else:
        txt = "error:入力が正しい形式ではありません。仕様を確認してもう一度リプライをお願いします。"
        return str(txt)
    # except Exception as e:
        # print(str(e))
        # txt = "calerror:" + str(e)
        # txt = "error:入力が正しい形式ではありません。仕様を確認してもう一度リプライをお願いします。"
        # print(txt + str(e))
        # return txt


def calorie(id, value):
    calorie = 0
    j = data_setting.is_int(value)
    if "min" in value and j == False:
        num = value.strip("min")
        num = float(num)
        print("min")
        if id == "腹筋":
            calorie = round(float(num), 2) * 8.67
        elif id == "スクワット":
            calorie = round(float(num), 2) * 5.69
        elif id == "腕立て" or id == "腕立て伏せ":
            calorie = round(float(num), 2) * 4.32
        elif id == "ランニング":
            calorie = round(float(num), 2) * 7.28
        elif id == "プランク":
            calorie = round(float(num), 2) * 3.0
        elif id == "サイドプランク":
            calorie = round(float(num), 2) * 3.0
        elif id == "背筋":
            calorie = round(float(num), 2) * 8.1
        else:
            calorie = "error"
    elif "回" in value and j == False:
        print("回")
        num = value.strip("回")
        num = float(num)
        if id == "腹筋":
            calorie = round(float(num), 2) * 0.29
        elif id == "腕立て" or id == "腕立て伏せ":
            calorie = round(float(num), 2) * 0.144
        elif id == "スクワット":
            calorie = round(float(num), 2) * 0.15
        elif id == "背筋":
            calorie = round(float(num), 2) * 0.27
        elif id == "ベンチプレス":
            calorie = round(float(num), 2) * 3.1
        else:
            calorie = "error"
    elif "km" in value and j == False:
        print("km")
        num = value.strip("km")
        # print(num)
        # num = float(num)
        if id == "ウォーキング" or id == "ランニング":
            calorie = round(float(num), 2) * 40.89
    elif "cal" in value and j == False:
        print("cal")
        num = value.strip("cal")
        num = float(num)
        calorie = round(float(num), 2)
    elif j == True:
        print("no_tani")
        num = value
        if id == "腹筋":
            calorie = round(float(num), 2) * 0.29
        elif id == "腕立て" or id == "腕立て伏せ":
            calorie = round(float(num), 2) * 0.144
        elif id == "スクワット":
            calorie = round(float(num), 2) * 0.15 * 3
        elif id == "背筋":
            calorie = round(float(num), 2) * 0.27 * 3
        elif id == "ベンチプレス":
            calorie = round(float(num), 2) * 3.1
        else:
            calorie = "error"
    else:
        calorie = "error"
    if calorie == 0:
        calorie = "error"
    return calorie
