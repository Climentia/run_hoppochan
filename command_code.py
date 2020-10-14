import keiro
import os


def dict(txt, username):
    try:
        list0 = txt.split("\n")
        list = []
        for i in range(1, len(list0)):
            line = list0[i].split(":")
            list.append(line)
        header = list0[0]
        file_check = os.path.exists("./data/place_log.csv")
        if "command_p" in header and file_check == False:
            start = list[0][1]
            end = list[1][1]
            a = keiro.keiro(start, end)
            print(a)
            txt = "経路情報が入力されました。"
        elif "command_p" in header and file_check == True:
            txt = "すでに経路は入力されています。"
        elif "ccomand_r" in header and username == "@Basil_tai2":
            os.remove("route_point.csv")
            txt = "経路情報はリセットされました。"
        elif "ccomand_r" in header and username != "@Basil_tai2":
            txt = "error:特定のユーザーにのみ許可されたコマンドです。"
        else:
            txt = "error:適切なコマンド入力ではありません。"
        return txt
        pass
    except Exception as e:
        txt = "command.py:error:" + str(e)
        if len(txt) > 200:
            txt = "error:google mapより経路情報を入手できませんでした。"
        elif "route_point.csv" in txt or "route_point_interpolation.csv" in txt:
            txt = "error:ファイルを開けませんでした。"
        return txt
