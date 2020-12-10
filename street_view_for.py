import requests
import math
from math import sin
from math import cos
from math import tan
from math import atan2
from math import degrees
import shutil
import os
import numpy as np
from PIL import Image, ImageDraw


def image_resize(width, image_name):
    resize_image = img.resize((width, int(width * img.size[1] / img.size[0])))  # 画像のリサイズ
    print("アスペクト比固定　width: {}, height: {}".format(resize_image.size[0], resize_image.size[1]))  # 画像のサイズ出力
    resize_image.save('images/' + image_name)  # 画像の保存


def select_color(color):
    mean = np.array(color).mean(axis=0)
    return (255, 255, 255, 0) if mean >= 250 else color


def to_touka(img):
    w, h = img.size
    touka_img = Image.new('RGBA', (w, h))
    np.array([[touka_img.putpixel((x, y), select_color(img.getpixel((x, y)))) for x in range(w)] for y in range(h)])
    return touka_img


def pic_make(path ,path2):
    img = Image.open(path)  # イメージを開く
    print("元の画像サイズ　width: {}, height: {}".format(img.size[0], img.size[1]))  # 元の画像のサイズ出力
    # 画像を指定したサイズに変更
    img_resize = img.resize((44, 68))  # 画像のリサイズ
    print("指定サイズ　width: {}, height: {}".format(img_resize.size[0], img_resize.size[1]))  # 画像のサイズ出力

    img_resize.save('temp.png')

    img_con = img_resize.convert("RGBA")
    img_touka = to_touka(img_con)

    layer1 = Image.open("./street_view/pic/streetview0.png")
    layer1.paste(img_touka, (0, 30), img_touka)
    layer1.save(path2)


def streetview():
    print("streetview loading")
    with open("./key/google_key.txt", "r") as fr:
        MY_API_KEY = fr.readline()
    URL_FORMAT = "https://maps.googleapis.com/maps/api/streetview?size={}&location={}&heading={}&pitch={}&key={}"
    tate = "640"
    yoko = "320"
    target_dir = "./street_view/pic"
    delete_dir = "./street_view/delete"
    exist_file = os.path.exists(target_dir)
    exist_csv = os.path.exists("./data/streetview_palce.csv")
    if exist_csv ==True:
        if exist_file == True:
            os.rename(target_dir, delete_dir)
            shutil.rmtree(delete_dir)
        os.mkdir(target_dir)
        with open("./data/streetview_palce.csv", "r", encoding="utf-8") as fr:
            # gmaps = googlemaps.Client(key=MY_API_KEY)
            # location = "{},{}".format(lat, lng)
            size = "{}x{}".format(tate, yoko)
            lists_b = fr.readlines()
            lists = [line.split(",") for line in lists_b]
            # print(lists)
            for i in range(len(lists)-1):
                ido_before = float(lists[i][0])
                keido_before = float(lists[i][1])
                ido_after = float(lists[i+1][0])
                keido_after = float(lists[i+1][1])
                # ido_diff = round(float(ido_after) - float(ido_before), 5)
                # print("ido_diff:" + str(ido_diff))
                # keido_diff = round(float(keido_after) - float(keido_before), 5)
                # print("keido_diff:" + str(keido_diff))
                x1 = math.radians(keido_before)
                y1 = math.radians(ido_before)
                x2 = math.radians(keido_after)
                y2 = math.radians(ido_after)
                deltax = x2 - x1
                # 角度計算
                muki = degrees(atan2(sin(deltax), (cos(y1)*tan(y2)-sin(y1)*cos(deltax)))) % 360
                kakudo = 0.76
                lat = ido_after
                lon = keido_after
                location = "{},{}".format(lat, lon)
                heading = "{}".format(muki)
                # print(str(i) + ":muki:" + str(muki))
                pitch = "{}".format(kakudo)
                key = "{}".format(MY_API_KEY)
                url = URL_FORMAT.format(size, location, heading, pitch, key)
                print("画像取得:" + url)
                filename = "./street_view/pic/streetview" + str(i)
                file_name = "{}.{}".format(filename, "png")
                res = requests.get(url)
                if res.status_code == 200:
                    with open(file_name, "wb") as f:
                        f.write(res.content)
                #      path1 = "./street_view/asasio.jpg"
                #     pic_make(path1, file_name)
    else:
        print("path:./data/streetview_palce.csv\nが存在しません")


streetview()
