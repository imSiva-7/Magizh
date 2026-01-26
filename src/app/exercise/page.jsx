// "use client";
// import { useReducer } from "react";
// const initialScore = [
//   {
//     id: 1,
//     score: 0,
//     name: "Siva",
//   },
//   {
//     id: 2,
//     score: 0,
//     name: "Rama",
//   },
// ];

// const reducer = (state, action) => {
//   switch (action) {
//     case "INCREASE":
//       return state.map((player) => {
//         if (player.id == action.id) {
//           return { ...player, score: player.score + 1 };
//         } else {
//           return player;
//         }
//       });
//   }
// };

// export default function ReducerHook() {
//   const [score, dispatch] = useReducer(reducer, initialScore);

//   const handleInput = (player) => {
//     dispatch({
//       type: "INCREASE",
//       id: player.id,
//     });
//   };
//   return (
//     <>
//       {score.map((player) => (
//         <div key={player.id}>
//           <label>
//             {" "}
//             {player.score}
//             <input
//               type="button"
//               onClick={() => handleInput(player)}
//               value={player.name}
//             />
//           </label>
//         </div>
//       ))}
//     </>
//   );
// }
