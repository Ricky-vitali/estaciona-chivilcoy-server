import { realtimeDB, firestoreDB } from "./db";
import * as express from "express";
import * as bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import * as cors from "cors";
import { getMerchantOrder } from "./db";

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://estaciona-chivilcoy-j9mv.onrender.com"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const platesCollectionRef = firestoreDB.collection("carPlate");

async function getExpiredCarIds(objetos) {
  const currentDate = new Date();

  const expiredCarIds = Object.keys(objetos).filter((key) => {
    const expirationTime = new Date(objetos[key].expirationTime);
    return expirationTime < currentDate;
  });

  console.log(expiredCarIds);

  if (expiredCarIds.length > 0) {
    for (const carId of expiredCarIds) {
      const userId = objetos[carId].userId;
      const realCarId = objetos[carId].carId;
      const userCarIdRef = realtimeDB.ref("users/");

      console.log("UserID: ", userId, "carId: ", realCarId);
      try {
        await realtimeDB
          .ref(`/parkedCars/${carId}`)
          .remove()
          .then(() => {
            console.log("Auto removido");
          });
        await userCarIdRef.get().then((currentSnap) => {
          var csData = currentSnap.val();
          console.log(csData);
          if (csData[userId].cars[realCarId].isParked === true) {
            csData[userId].cars[realCarId].isParked = false;
            userCarIdRef.update(csData);
            console.log(
              "isParked del auto :",
              csData[userId].cars[realCarId].name,
              "Seteado a 'false'"
            );
          } else if (csData[userId].cars[realCarId].isParked === false) {
            console.log("isParked ya es false, chequear funcionamiento");
          }
        });
      } catch (error) {
        console.error("Error al actualizar el estado del auto:", error);
      }
    }
  }
}

(async () => {
  const rtdbRef = realtimeDB.ref("/parkedCars/");
  rtdbRef.on("value", (snap) => {
    let data = snap.val();
    //Para que no aparezca el prueba: 1 que esta en al database
    delete data.prueba;
    const intervalId = setInterval(() => {
      getExpiredCarIds(data);
    }, 30000);
  });
})();

app.post("/addTime/:carId/:time", async (req, res) => {
  // Recibe el carId para buscarlo en la RTDB, y al encontrarlo, extrae el expiration time y le agrega el tiempo agregado
  const { carId, time } = req.params;

  try {
    // Convertir el tiempo recibido a minutos
    const timeToAdd = parseInt(time);

    // Obtener la referencia al objeto correspondiente en parkedCars
    const parkedCarsRef = realtimeDB.ref("/parkedCars/");
    const snapshot = await parkedCarsRef.once("value");
    const parkedCarsData = snapshot.val();
    console.log({ parkedCarsData });
    if (parkedCarsData) {
      // Buscar el objeto dentro de parkedCars que tenga el carId especificado
      for (const parkedCarId in parkedCarsData) {
        console.log({ parkedCarId });
        if (
          parkedCarsData.hasOwnProperty(parkedCarId) &&
          parkedCarsData[parkedCarId].carId === carId
        ) {
          const currentExpirationTime = new Date(
            parkedCarsData[parkedCarId].expirationTime
          );

          // Calcular el nuevo expirationTime sumando el tiempo en minutos
          const newExpirationTime = new Date(
            currentExpirationTime.getTime() + timeToAdd * 60000
          );

          // Formatear la fecha en el formato deseado
          const formattedExpirationTime = newExpirationTime.toString();

          // Actualizar la propiedad expirationTime en la base de datos
          await parkedCarsRef.child(parkedCarId).update({
            expirationTime: formattedExpirationTime,
          });

          res.status(200).send("Expiration time updated successfully.");
          return; // Salir del bucle después de actualizar
        }
      }

      res.status(404).send("Car ID not found in parkedCars.");
    } else {
      res.status(404).send("No cars found in parkedCars.");
    }
  } catch (error) {
    console.error("Error updating expiration time:", error);
    res.status(500).send("Internal server error.");
  }
});

app.get("/getUserData/:userId", async (req, res) => {
  const { userId } = req.params;
  const userRef = realtimeDB.ref("users/" + userId);

  try {
    const snap = await userRef.get();
    if (snap.exists()) {
      const snapData = snap.val();
      const carsData = snapData.cars;

      const carsArray = await Promise.all(
        Object.keys(carsData).map(async (carId) => {
          const car = {
            id: carId,
            ...carsData[carId],
          };

          const plateDoc = await platesCollectionRef.doc(car.plate).get();
          if (plateDoc.exists) {
            const plateData = plateDoc.data();
            car.type = plateData.type;
            car.color = plateData.color;
            car.brand = plateData.brand;
          }

          return car;
        })
      );

      res.json(carsArray);
    } else {
      res.status(404).send({
        message: "El userID No existe",
      });
    }
  } catch (error) {
    console.error("Error al obtener los datos:", error);
    res.status(500).send({
      message: "Error al obtener los datos",
    });
  }
});

//Cuando va a estacionar el auto, ingresa sus datos y luego se agregan a a "/Parkedcars"
app.post("/parkCar", (req, res) => {
  const { coordinates, carId, userId, time, plate } = req.body;
  if (!coordinates || !carId || !userId || !time || !plate) {
    res.status(400).send({ message: "Faltan datos en el body" });
  } else {
    // Crea una date nueva y le setea los minutos que recibió, para posteriormente guardarlos en la RTDB Como string
    const currentTime = new Date();
    const expirationTime = new Date(currentTime.getTime() + time * 60000);

    let carData;
    //Trae todo de la RTDB
    const rtdbData = realtimeDB.ref("/");
    rtdbData
      .get()
      .then((snap) => {
        const allData = snap.val();
        //Busca la info del auto para guardarlas en el string declarado anteriormente
        carData = allData.users[userId].cars[carId];

        // Update the 'isParked' property to true in the user's car entry
        realtimeDB.ref(`/users/${userId}/cars/${carId}`).update({
          isParked: true,
        });

        //Setea en "/parkedCars", los siguientes datos
        return realtimeDB.ref("/parkedCars/" + uuidv4()).set({
          carId: carId,
          coordinates: coordinates,
          userId: userId,
          name: carData.name,
          expirationTime: expirationTime.toString(),
          plate: plate,
        });
      })
      .then(() => {
        res.json({
          message: "Estacionado con éxito!",
        });
      })
      .catch((error) => {
        res.status(500).json({
          error: "Error al estacionar el auto: " + error.message,
        });
      });
  }
});

app.post("/createCar", (req, res) => {
  let randomId = uuidv4();
  const { carName, plate, userId } = req.body;
  console.log("el post '/createCar', recibió: ", req.body);
  if (!carName || !plate || !userId) {
    res.status(400).send({
      message:
        "Faltan datos en el body, la request debe recibir 'carName', 'plate' y 'userId' en el body",
    });
  } else {
    const rtdbRef = realtimeDB.ref("users/" + userId);
    platesCollectionRef
      .doc(plate.toString())
      .get()
      .then((doc) => {
        if (doc.exists) {
          rtdbRef
            .get()
            .then((currentDataSnap) => {
              let currentDataSnapData = currentDataSnap.val();
              // Si existe un "/cars/, lo agrega a .cars", pero primero chequea si ya tiene otro auto con la misma patente
              if (currentDataSnapData.cars) {
                Object.assign(currentDataSnapData.cars, {
                  [randomId]: {
                    expirationTime: "",
                    isParked: false,
                    name: carName,
                    plate: plate,
                  },
                });
                rtdbRef.update(currentDataSnapData);
              } else {
                // Si no existe, lo agrega,
                Object.assign(currentDataSnapData, {
                  cars: {
                    [randomId]: {
                      expirationTime: "",
                      isParked: false,
                      name: carName,
                      plate: plate,
                    },
                  },
                });
                rtdbRef.update(currentDataSnapData);
              }
            })
            .then(() => {
              console.log("Auto agregado");
              res.json({
                message: "Auto agregado!",
              });
            });
        } else {
          console.log("Pantente error");
          res
            .status(401)
            .send({ message: "Numero de patente incorrecto o inexistente" });
        }
      });
  }
});

app.get("/parkedCars/:userId/:isOfficer?", async (req, res) => {
  const { userId, isOfficer } = req.params;
  let isOfficerBoolean;

  if (isOfficer === "false") {
    isOfficerBoolean = false;
  } else if (isOfficer === "true") {
    isOfficerBoolean = true;
  }

  try {
    console.log("/parkedCars recibió: ", req.params);

    const parkedCarsRef = realtimeDB.ref("parkedCars/");
    const snap = await parkedCarsRef.get();
    const snapData = snap.val();

    if (isOfficerBoolean === true) {
      console.log("Officer true");
      if (snap.exists()) {
        const objectsArray = Object.values(snapData);

        // Obtener datos adicionales de Firestore para cada placa
        const enhancedDataPromises = objectsArray.map(async (data: any) => {
          const plate = data.plate;
          if (typeof plate === "string" && plate.trim() !== "") {
            const plateDoc = await platesCollectionRef.doc(plate).get();
            if (plateDoc.exists) {
              const plateData = plateDoc.data();
              return { ...data, ...plateData };
            }
          }
          return data;
        });

        const enhancedData = await Promise.all(enhancedDataPromises);

        res.json(enhancedData);
      } else {
        res.json({ message: "No hay ningún auto estacionado" });
      }
    } else if (isOfficerBoolean === false) {
      console.log("Officer false");
      const filteredDataPromises = Object.keys(snapData).map(async (key) => {
        const data = snapData[key];
        if (typeof data === "object" && data.userId === userId) {
          const plate = data.plate;
          if (typeof plate === "string" && plate.trim() !== "") {
            const plateDoc = await platesCollectionRef.doc(plate).get();
            if (plateDoc.exists) {
              const plateData = plateDoc.data();
              return { ...data, ...plateData };
            }
          }
        }
        return null;
      });

      const filteredData = (await Promise.all(filteredDataPromises)).filter(
        (data) => data !== null
      );

      res.json(filteredData);
    }
  } catch (error) {
    console.error("Error retrieving data:", error);
    res.status(500).send("Internal server error.");
  }
});
app.delete("/deleteCar", (req, res) => {
  const { userId, carId } = req.body;
  console.log("/deleteCar recibió: ", req.body);
  if (!carId || !userId) {
    res.status(400).send({ message: "Faltan datos en el body" });
  }
  const userCarRef = realtimeDB.ref("users/" + userId + "/cars/" + carId);

  userCarRef
    .remove()
    .then(() => {
      res.json({ message: "Auto removido!" });
    })
    .catch((error) => {
      console.error("Error al eliminar el auto:", error);
      res.status(500).send({ message: "Error al eliminar el auto" });
    });
});

/* MERCADO PAGO */
// Este webhook recibe 2 peticiones, la que se necesita para saber el
// order_status es el que tiene el topic: "merchant_order" en el query
app.post("/webhook/mercadopago", async (req, res) => {
  const { id, topic } = req.query;
  try {
    console.log(
      "SOY EL WEBHOOK/MERCADOPAGO ",
      "req.body: ",
      req.body,
      "req.query: ",
      req.query
    );
    if (topic == "merchant_order") {
      const order = await getMerchantOrder(Number(id));
      console.log({ order });
      res.send("ok");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/", function (req, res) {
  res.send("el servidor de estaciona chivilcoy funciona!");
});

app.listen(PORT, () => {
  console.log("API running at ", PORT);
});
